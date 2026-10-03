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
        {"messages": [{"role": "user", "content": "x" * 32001}]},
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
        assert api.get("/api/health").json() == {
            "status": "ok",
            "configured": False,
            "agent": None,
        }
        response = api.post("/api/chat", json=QUESTION)
    assert response.status_code == 503
    assert "FOUNDRY_PROJECT_ENDPOINT" in response.json()["error"]
