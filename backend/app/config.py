from pathlib import Path

from pydantic import Field, HttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    # Project endpoint: https://<resource>.services.ai.azure.com/api/projects/<project>
    foundry_project_endpoint: HttpUrl | None = None
    foundry_agent_name: str = ""
    # Omit to use the agent's latest version.
    foundry_agent_version: str | None = None
    foundry_timeout_s: float = Field(default=60, gt=0, le=300)
    allowed_hosts: list[str] = ["localhost", "127.0.0.1", "testserver"]

    @property
    def configured(self) -> bool:
        return bool(self.foundry_project_endpoint and self.foundry_agent_name)
