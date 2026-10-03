import asyncio

import httpx
import openai
import pytest
from app.config import Settings
from app.foundry import AnswerIncomplete, ArtifactNotFound, ArtifactTooLarge, ConversationNotFound
from app.main import create_app
from azure.core.exceptions import ClientAuthenticationError
from fastapi.testclient import TestClient

QUESTION = {"question": "Total revenue?"}


class FakeAgent:
    """Keeps conversations per user, the way the Foundry metadata tags them."""

    def __init__(self, answer="R$ 13.6M", error=None):
        self.answer, self.error, self.received = answer, error, None
        self.store: dict[str, tuple[str, list[dict]]] = {}

    def owned(self, conversation_id, user):
        if conversation_id not in self.store or self.store[conversation_id][0] != user:
            raise ConversationNotFound
        return self.store[conversation_id][1]

    async def ask(self, question, conversation_id, user):
        self.received = (question, conversation_id, user)
        if conversation_id:
            self.owned(conversation_id, user)
        if self.error:
            raise self.error
        conversation_id = conversation_id or f"conv_{len(self.store) + 1}"
        messages = self.store.setdefault(conversation_id, (user, []))[1]
        messages += [
            {"id": f"msg_{len(messages)}", "role": "user", "content": question},
            {"id": f"msg_{len(messages) + 1}", "role": "assistant", "content": self.answer},
        ]
        return conversation_id, self.answer

    async def conversations(self, user, limit):
        return [
            {"id": key, "title": messages[0]["content"], "created_at": 0}
            for key, (owner, messages) in reversed(self.store.items())
            if owner == user
        ][:limit]

    async def messages(self, conversation_id, user):
        return self.owned(conversation_id, user)

    async def delete(self, conversation_id, user):
        self.owned(conversation_id, user)
        del self.store[conversation_id]

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


def test_chat_starts_and_continues_a_foundry_conversation():
    agent = FakeAgent()
    with client(agent) as api:
        first = api.post("/api/chat", json={"question": "  Total revenue? "})
        assert first.status_code == 200
        conversation_id = first.json()["conversation_id"]
        assert first.json() == {
            "request_id": first.headers["X-Request-ID"],
            "conversation_id": conversation_id,
            "answer": "R$ 13.6M",
        }
        assert agent.received == ("Total revenue?", None, "local")
        follow_up = {"question": "Only 2018", "conversation_id": conversation_id}
        assert api.post("/api/chat", json=follow_up).json()["conversation_id"] == conversation_id
        assert agent.received == ("Only 2018", conversation_id, "local")


def test_history_is_read_back_from_foundry_and_can_be_deleted():
    agent = FakeAgent()
    with client(agent) as api:
        conversation_id = api.post("/api/chat", json=QUESTION).json()["conversation_id"]
        assert api.get("/api/conversations").json() == [
            {"id": conversation_id, "title": "Total revenue?", "created_at": 0}
        ]
        detail = api.get(f"/api/conversations/{conversation_id}").json()
        assert [message["role"] for message in detail["messages"]] == ["user", "assistant"]
        assert api.delete(f"/api/conversations/{conversation_id}").status_code == 204
        assert api.get(f"/api/conversations/{conversation_id}").status_code == 404
        assert api.get("/api/conversations").json() == []


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"question": "   "},
        {"question": "x" * 4001},
        {"question": "hi", "conversation_id": "../DROP TABLE"},
        {"messages": [{"role": "user", "content": "DROP TABLE"}]},
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
        assert api.get("/api/conversations").status_code == 401
        signed_in = {"x-ms-client-principal-id": "user-1"}
        assert api.post("/api/chat", json=QUESTION, headers=signed_in).status_code == 200
    assert agent.received == ("Total revenue?", None, "user-1")


def test_conversations_are_private_to_their_user():
    agent = FakeAgent()
    config = settings(app_env="production", auth_mode="azure_container_apps")
    alice = {"x-ms-client-principal-id": "alice"}
    bob = {"x-ms-client-principal-id": "bob"}
    with client(agent, config) as api:
        started = api.post("/api/chat", json=QUESTION, headers=alice)
        conversation_id = started.json()["conversation_id"]
        assert api.get("/api/conversations", headers=bob).json() == []
        url = f"/api/conversations/{conversation_id}"
        assert api.get(url, headers=bob).status_code == 404
        assert api.delete(url, headers=bob).status_code == 404
        follow_up = {"question": "Only 2018", "conversation_id": conversation_id}
        response = api.post("/api/chat", json=follow_up, headers=bob)
        assert response.status_code == 404
        assert "Total revenue" not in response.text
        assert api.get(url, headers=alice).status_code == 200


@pytest.mark.parametrize("chunked", [False, True])
def test_request_bytes_are_bounded_while_streaming(chunked):
    agent = FakeAgent()
    padded = b'{"question": "hi"}' + b" " * 70_000
    body = iter([padded[i : i + 4096] for i in range(0, len(padded), 4096)]) if chunked else padded
    with client(agent) as api:
        response = api.post("/api/chat", content=body)
    assert response.status_code == 413
    assert agent.received is None


def test_invalid_conversation_id_in_path_is_rejected():
    with client(FakeAgent()) as api:
        assert api.get("/api/conversations/not-a-conversation").status_code == 422


def test_concurrent_calls_beyond_the_limit_are_rejected():
    class SlowAgent(FakeAgent):
        active = peak = 0

        async def ask(self, question, conversation_id, user):
            SlowAgent.active += 1
            SlowAgent.peak = max(SlowAgent.peak, SlowAgent.active)
            await asyncio.sleep(0.2)
            SlowAgent.active -= 1
            return "conv_1", "ok"

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


def test_chart_and_csv_download_headers_and_caller():
    class FileAgent(FakeAgent):
        async def artifact(self, conversation_id, container_id, file_id, user):
            self.owned(conversation_id, user)
            self.received = (conversation_id, container_id, file_id, user)
            return (
                (b"png", "monthly revenue.png")
                if file_id == "chart"
                else (b"month,revenue\n2018-01,100.25\n", "revenue.csv")
            )

    agent = FileAgent()
    agent.store["conv_1"] = ("alice", [])
    config = settings(app_env="production", auth_mode="azure_container_apps")
    url = "/api/conversations/conv_1/files/cntr_1/chart"
    with client(agent, config) as api:
        assert api.get(url).status_code == 401
        assert api.get(url, headers={"x-ms-client-principal-id": "bob"}).status_code == 404
        alice = {"x-ms-client-principal-id": "alice"}
        preview = api.get(url, headers=alice)
        assert preview.status_code == 200 and preview.content == b"png"
        assert preview.headers["content-type"] == "image/png"
        assert preview.headers["content-disposition"].startswith("inline;")
        assert preview.headers["cache-control"] == "no-store"
        assert agent.received == ("conv_1", "cntr_1", "chart", "alice")
        download = api.get(url + "?download=true", headers=alice)
        assert download.headers["content-disposition"].startswith("attachment;")
        assert "monthly%20revenue.png" in download.headers["content-disposition"]
        csv = api.get(url.replace("chart", "csv"), headers=alice)
        assert csv.headers["content-type"].startswith("text/csv")
        assert csv.headers["content-disposition"].startswith("attachment;")


@pytest.mark.parametrize(
    "error,status",
    [(ArtifactNotFound(), 404), (ArtifactTooLarge(), 413), (AnswerIncomplete(), 502)],
)
def test_artifact_and_incomplete_errors_are_actionable(error, status):
    class FileAgent(FakeAgent):
        async def artifact(self, *args):
            raise error

    with client(FileAgent(error=error)) as api:
        path = (
            "/api/chat"
            if isinstance(error, AnswerIncomplete)
            else ("/api/conversations/conv_1/files/cntr_1/cfile_1")
        )
        response = api.post(path, json=QUESTION) if path == "/api/chat" else api.get(path)
        assert response.status_code == status
        assert response.json()["request_id"] == response.headers["X-Request-ID"]
