import json

import openai
import pytest
from app import foundry
from app.config import Settings
from azure.core.credentials import AccessToken
from httpx2 import MockTransport, Response


class FakeCredential:
    scopes = None

    async def get_token(self, *scopes, **kwargs):
        FakeCredential.scopes = scopes
        return AccessToken("test-token", 4102444800)

    async def get_token_info(self, *scopes, **kwargs):
        return await self.get_token(*scopes)

    async def close(self):
        pass


@pytest.mark.anyio
@pytest.mark.parametrize(("version", "expected"), [("13", {"version": "13"}), (None, {})])
async def test_request_matches_foundry_agent_reference_contract(monkeypatch, version, expected):
    monkeypatch.setattr(foundry, "DefaultAzureCredential", FakeCredential)
    captured = {}

    def handler(request):
        captured.update(
            url=str(request.url),
            auth=request.headers["Authorization"],
            body=json.loads(request.content),
        )
        return Response(
            200,
            json={
                "id": "resp_1",
                "object": "response",
                "created_at": 0,
                "model": "gpt",
                "status": "completed",
                "output": [
                    {
                        "id": "msg_1",
                        "type": "message",
                        "role": "assistant",
                        "status": "completed",
                        "content": [{"type": "output_text", "text": "Hello", "annotations": []}],
                    }
                ],
                "parallel_tool_calls": False,
                "tool_choice": "auto",
                "tools": [],
            },
        )

    agent = foundry.FoundryAgent(
        Settings(
            _env_file=None,
            foundry_project_endpoint="https://ttmd.services.ai.azure.com/api/projects/demo",
            foundry_agent_name="olist-agent",
            foundry_agent_version=version,
        )
    )
    agent.client = agent.client.with_options(
        http_client=openai.DefaultAsyncHttpxClient(transport=MockTransport(handler))
    )
    messages = [{"role": "user", "content": "Tell me what you can help with."}]
    try:
        assert await agent.ask(messages) == "Hello"
    finally:
        await agent.close()

    assert (
        captured["url"]
        == "https://ttmd.services.ai.azure.com/api/projects/demo/openai/v1/responses"
    )
    assert captured["auth"] == "Bearer test-token"
    assert FakeCredential.scopes == ("https://ai.azure.com/.default",)
    assert captured["body"] == {
        "input": messages,
        "agent_reference": {"type": "agent_reference", "name": "olist-agent", **expected},
    }
