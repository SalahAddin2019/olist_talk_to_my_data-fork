from typing import Any

from azure.ai.projects.aio import AIProjectClient
from azure.identity.aio import DefaultAzureCredential

from app.config import Settings


class FoundryAgent:
    """Sends a conversation to a Foundry agent through the project's Responses API."""

    def __init__(self, settings: Settings):
        self.reference: dict[str, str] = {
            "type": "agent_reference",
            "name": settings.foundry_agent_name,
        }
        if settings.foundry_agent_version:
            self.reference["version"] = settings.foundry_agent_version
        # Foundry agents accept Entra ID only: az login locally, managed identity in Azure.
        self.credential = DefaultAzureCredential()
        self.project = AIProjectClient(
            endpoint=str(settings.foundry_project_endpoint), credential=self.credential
        )
        self.client = self.project.get_openai_client(
            timeout=settings.foundry_timeout_s, max_retries=1
        )

    async def ask(self, messages: list[dict[str, Any]]) -> str:
        # Stateless call: the browser owns the history and sends it with every question.
        response = await self.client.responses.create(
            input=messages, extra_body={"agent_reference": self.reference}
        )
        return response.output_text

    async def close(self):
        await self.client.close()
        await self.project.close()
        await self.credential.close()
