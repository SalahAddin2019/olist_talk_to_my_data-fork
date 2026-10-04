import json
from copy import deepcopy

import openai
import pytest
from app import foundry
from app.config import Settings
from azure.core.credentials import AccessToken
from httpx2 import MockTransport, Response

ENDPOINT = "https://ttmd.services.ai.azure.com/api/projects/demo"
BASE = f"{ENDPOINT}/openai/v1"
OWNED = {"user_id": "alice", "agent": "olist-agent", "title": "Total revenue?"}


class FakeCredential:
    scopes = None

    async def get_token(self, *scopes, **kwargs):
        FakeCredential.scopes = scopes
        return AccessToken("test-token", 4102444800)

    async def get_token_info(self, *scopes, **kwargs):
        return await self.get_token(*scopes)

    async def close(self):
        pass


def conversation(id, metadata):
    return {"id": id, "object": "conversation", "created_at": 1, "metadata": metadata}


def message(id, role, kind, text):
    return {
        "id": id,
        "type": "message",
        "role": role,
        "status": "completed",
        "content": [
            {"type": kind, "text": text, **({"annotations": []} if role == "assistant" else {})}
        ],
    }


RESPONSE = {
    "id": "resp_1",
    "object": "response",
    "created_at": 0,
    "model": "gpt",
    "status": "completed",
    "output": [message("msg_1", "assistant", "output_text", "Hello")],
    "parallel_tool_calls": False,
    "tool_choice": "auto",
    "tools": [],
}


@pytest.fixture
def make_agent(monkeypatch):
    """A FoundryAgent whose HTTP calls go to `routes`, keyed by (method, path)."""
    monkeypatch.setattr(foundry, "DefaultAzureCredential", FakeCredential)

    def make(routes, version=None):
        calls = []

        def handler(request):
            path = str(request.url.copy_with(query=None)).removeprefix(BASE)
            body = json.loads(request.content) if request.content else None
            calls.append((request.method, path, dict(request.url.params), body))
            assert request.headers["Authorization"] == "Bearer test-token"
            route = routes.get((request.method, path))
            if route is None:
                return Response(404, json={"error": {"message": "not found"}})
            result = route(request) if callable(route) else route
            return result if isinstance(result, Response) else Response(200, json=result)

        agent = foundry.FoundryAgent(
            Settings(
                _env_file=None,
                foundry_project_endpoint=ENDPOINT,
                foundry_agent_name="olist-agent",
                foundry_agent_version=version,
            )
        )
        agent.client = agent.client.with_options(
            http_client=openai.DefaultAsyncHttpxClient(transport=MockTransport(handler))
        )
        return agent, calls

    return make


@pytest.mark.anyio
@pytest.mark.parametrize(("version", "expected"), [("13", {"version": "13"}), (None, {})])
async def test_first_question_creates_a_tagged_conversation(make_agent, version, expected):
    agent, calls = make_agent(
        {
            ("POST", "/conversations"): conversation("conv_new", OWNED),
            ("POST", "/responses"): RESPONSE,
        },
        version,
    )
    try:
        assert await agent.ask("Total revenue?", None, "alice") == ("conv_new", "Hello")
    finally:
        await agent.close()

    assert FakeCredential.scopes == ("https://ai.azure.com/.default",)
    assert [(method, path) for method, path, _, _ in calls] == [
        ("POST", "/conversations"),
        ("POST", "/responses"),
    ]
    assert calls[0][3] == {"metadata": OWNED}
    assert calls[1][3] == {
        "conversation": "conv_new",
        "input": [{"role": "user", "content": "Total revenue?"}],
        "agent_reference": {"type": "agent_reference", "name": "olist-agent", **expected},
    }


@pytest.mark.anyio
async def test_failed_first_answer_removes_the_new_conversation(make_agent):
    agent, calls = make_agent(
        {
            ("POST", "/conversations"): conversation("conv_new", OWNED),
            ("POST", "/responses"): Response(400, json={"error": {"message": "bad"}}),
            ("DELETE", "/conversations/conv_new"): {"id": "conv_new", "deleted": True},
        }
    )
    try:
        with pytest.raises(openai.BadRequestError):
            await agent.ask("Total revenue?", None, "alice")
    finally:
        await agent.close()
    assert calls[-1][:2] == ("DELETE", "/conversations/conv_new")


@pytest.mark.anyio
async def test_follow_up_checks_the_owner_before_answering(make_agent):
    routes = {
        ("GET", "/conversations/conv_1"): conversation("conv_1", OWNED),
        ("POST", "/responses"): RESPONSE,
    }
    agent, calls = make_agent(routes)
    try:
        assert await agent.ask("Only 2018", "conv_1", "alice") == ("conv_1", "Hello")
        assert calls[-1][3]["conversation"] == "conv_1"
        calls.clear()
        with pytest.raises(foundry.ConversationNotFound):
            await agent.ask("Only 2018", "conv_1", "bob")
        with pytest.raises(foundry.ConversationNotFound):
            await agent.ask("Only 2018", "conv_missing", "alice")
        routes[("GET", "/conversations/conv_bad")] = Response(
            400, json={"error": {"message": "Malformed identifier."}}
        )
        with pytest.raises(foundry.ConversationNotFound):
            await agent.ask("Only 2018", "conv_bad", "alice")
    finally:
        await agent.close()
    assert ("POST", "/responses") not in [(method, path) for method, path, _, _ in calls]


@pytest.mark.anyio
async def test_list_keeps_only_the_callers_conversations_with_this_agent(make_agent):
    pages = {
        None: {
            "data": [
                conversation("conv_a", OWNED),
                conversation("conv_b", {**OWNED, "user_id": "bob"}),
                conversation("conv_c", {**OWNED, "agent": "other-agent"}),
                conversation("conv_d", {}),
            ],
            "has_more": True,
            "last_id": "conv_d",
        },
        "conv_d": {
            "data": [conversation("conv_e", {"user_id": "alice", "agent": "olist-agent"})],
            "has_more": False,
            "last_id": "conv_e",
        },
    }
    agent, calls = make_agent(
        {("GET", "/conversations"): lambda request: pages[request.url.params.get("after")]}
    )
    try:
        found = await agent.conversations("alice", limit=50)
    finally:
        await agent.close()
    assert found == [
        {"id": "conv_a", "title": "Total revenue?", "created_at": 1},
        {"id": "conv_e", "title": "Untitled", "created_at": 1},
    ]
    assert calls[0][2]["limit"] == "100" and calls[0][2]["order"] == "desc"
    assert calls[1][2]["after"] == "conv_d"


@pytest.mark.anyio
async def test_messages_skip_tool_items(make_agent):
    items = {
        "object": "list",
        "data": [
            message("msg_1", "user", "input_text", "Total revenue?"),
            {
                "id": "fc_1",
                "type": "function_call",
                "call_id": "c1",
                "name": "sql",
                "arguments": "{}",
            },
            message("msg_2", "assistant", "output_text", "R$ 13.6M"),
            {
                **message("msg_partial", "assistant", "output_text", "Partial total"),
                "status": "incomplete",
            },
        ],
        "first_id": "msg_1",
        "last_id": "msg_2",
        "has_more": False,
    }
    agent, calls = make_agent(
        {
            ("GET", "/conversations/conv_1"): conversation("conv_1", OWNED),
            ("GET", "/conversations/conv_1/items"): items,
        }
    )
    try:
        assert await agent.messages("conv_1", "alice") == [
            {"id": "msg_1", "role": "user", "content": "Total revenue?"},
            {"id": "msg_2", "role": "assistant", "content": "R$ 13.6M"},
        ]
        with pytest.raises(foundry.ConversationNotFound):
            await agent.messages("conv_1", "bob")
    finally:
        await agent.close()
    assert calls[1][2]["order"] == "asc"


@pytest.mark.anyio
@pytest.mark.parametrize("status", ["incomplete", "failed", "completed"])
async def test_unfinished_or_approval_responses_are_not_business_answers(make_agent, status):
    response = deepcopy(RESPONSE)
    response["status"] = status
    if status == "completed":
        response["output"].append(
            {
                "type": "mcp_approval_request",
                "id": "approval_1",
                "arguments": "{}",
                "name": "postgres_database_query",
                "server_label": "postgres-mcp",
            }
        )
    agent, calls = make_agent(
        {
            ("POST", "/conversations"): conversation("conv_new", OWNED),
            ("POST", "/responses"): response,
            ("DELETE", "/conversations/conv_new"): {"id": "conv_new", "deleted": True},
        }
    )
    try:
        with pytest.raises(foundry.AnswerIncomplete):
            await agent.ask("Total revenue?", None, "alice")
        assert calls[-1][:2] == ("DELETE", "/conversations/conv_new")
    finally:
        await agent.close()
