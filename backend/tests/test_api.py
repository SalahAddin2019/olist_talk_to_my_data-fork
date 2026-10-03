import asyncio

import httpx
import openai
import pytest
from app.config import Settings
from app.main import create_app
from azure.core.exceptions import ClientAuthenticationError
from fastapi.testclient import TestClient

QUESTION = {"messages": [{"role": "user", "content": "Total revenue?"}]}


class FakeAgent:
    def __init__(self, answer="R$ 13.6M", error=None):
        self.answer, self.error, self.received = answer, error, None

    async def ask(self, messages):
        self.received = messages
        if self.error:
            raise self.error
        return self.answer

    async def close(self):
        pass


def settings(**kwargs):
    return Settings(
        _env_file=None,
        foundry_project_endpoint="https://example.services.ai.azure.com/api/projects/demo",
        foundry_agent_name="olist-agent",
        **kwargs,
    )


def client(agent, config=None):
    return TestClient(create_app(config or settings(), agent))


def status_error(cls, status):
    request = httpx.Request("POST", "https://example.invalid/responses")
    return cls("private detail", response=httpx.Response(status, request=request), body=None)


def test_chat_forwards_history_and_returns_answer():
    agent = FakeAgent()
    history = {
        "messages": [
            {"role": "user", "content": "Total revenue?"},
            {"role": "assistant", "content": "R$ 13.6M"},
            {"role": "user", "content": "Only 2018"},
        ]
    }
    with client(agent) as api:
        response = api.post("/api/chat", json=history)
    assert response.status_code == 200
    assert response.json() == {
        "request_id": response.headers["X-Request-ID"],
        "answer": "R$ 13.6M",
    }
    assert agent.received == history["messages"]


@pytest.mark.parametrize(
    "body",
    [
        {"messages": []},
        {"messages": [{"role": "assistant", "content": "hi"}]},
        {"messages": [{"role": "user", "content": "   "}]},
        {"messages": [{"role": "system", "content": "DROP TABLE"}]},
        {"messages": [{"role": "user", "content": "hi"}] * 21},
        {**QUESTION, "extra": "DROP TABLE"},
    ],
)
def test_invalid_requests_are_rejected_without_echo(body):
    agent = FakeAgent()
    with client(agent) as api:
        response = api.post("/api/chat", json=body)
    assert response.status_code == 422
    assert "DROP TABLE" not in response.text
    assert agent.received is None


@pytest.mark.parametrize(
    ("error", "status"),
    [
        (status_error(openai.RateLimitError, 429), 429),
        (status_error(openai.AuthenticationError, 401), 503),
        (status_error(openai.PermissionDeniedError, 403), 503),
        (ClientAuthenticationError("private detail"), 503),
        (status_error(openai.NotFoundError, 404), 502),
        (openai.APITimeoutError(httpx.Request("POST", "https://example.invalid")), 504),
    ],
)
def test_foundry_errors_map_to_safe_messages(error, status):
    with client(FakeAgent(error=error)) as api:
        response = api.post("/api/chat", json=QUESTION)
    assert response.status_code == status
    assert "private detail" not in response.text
    assert response.json()["request_id"] == response.headers["X-Request-ID"]


def test_empty_answer_is_an_error():
    with client(FakeAgent(answer=" ")) as api:
        assert api.post("/api/chat", json=QUESTION).status_code == 502


def test_unconfigured_backend_reports_setup_error():
    with TestClient(create_app(Settings(_env_file=None))) as api:
        health = api.get("/api/health").json()
        assert health["configured"] is False and health["agent"] is None
        response = api.post("/api/chat", json=QUESTION)
    assert response.status_code == 503
    assert "FOUNDRY_PROJECT_ENDPOINT" in response.json()["error"]


def test_production_requires_caller_authentication():
    with pytest.raises(ValueError):
        settings(app_env="production")
    with pytest.raises(ValueError):
        settings(app_env="production", auth_mode="azure_container_apps", allowed_hosts=["*"])
    agent = FakeAgent()
    config = settings(app_env="production", auth_mode="azure_container_apps")
    with client(agent, config) as api:
        assert api.get("/api/health").status_code == 200
        assert api.post("/api/chat", json=QUESTION).status_code == 401
        signed_in = {"x-ms-client-principal-id": "user-1"}
        assert api.post("/api/chat", json=QUESTION, headers=signed_in).status_code == 200
    assert agent.received is not None


@pytest.mark.parametrize("chunked", [False, True])
def test_request_bytes_are_bounded_while_streaming(chunked):
    agent = FakeAgent()
    padded = b'{"messages": [{"role": "user", "content": "hi"}]}' + b" " * 70_000
    body = iter([padded[i : i + 4096] for i in range(0, len(padded), 4096)]) if chunked else padded
    with client(agent) as api:
        response = api.post("/api/chat", content=body)
    assert response.status_code == 413
    assert agent.received is None


def test_conversation_budget_is_enforced():
    agent = FakeAgent()
    long_history = {
        "messages": [
            {"role": "user", "content": "x" * 3000},
            {"role": "assistant", "content": "y" * 3000},
            {"role": "user", "content": "next"},
        ]
    }
    with client(agent, settings(max_conversation_chars=5000)) as api:
        response = api.post("/api/chat", json=long_history)
    assert response.status_code == 413
    assert agent.received is None


def test_concurrent_calls_beyond_the_limit_are_rejected():
    class SlowAgent(FakeAgent):
        active = peak = 0

        async def ask(self, messages):
            SlowAgent.active += 1
            SlowAgent.peak = max(SlowAgent.peak, SlowAgent.active)
            await asyncio.sleep(0.2)
            SlowAgent.active -= 1
            return "ok"

    async def burst():
        app = create_app(settings(max_concurrent_requests=2), SlowAgent())
        transport = httpx.ASGITransport(app=app)
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as api:
                return await asyncio.gather(
                    *(api.post("/api/chat", json=QUESTION) for _ in range(8))
                )

    statuses = sorted(response.status_code for response in asyncio.run(burst()))
    assert statuses == [200, 200] + [429] * 6
    assert SlowAgent.peak == 2
