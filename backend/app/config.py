from pathlib import Path
from typing import Literal

from pydantic import Field, HttpUrl, model_validator
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
    app_env: Literal["local", "production"] = "local"
    auth_mode: Literal["local", "azure_container_apps"] = "local"
    allowed_hosts: list[str] = ["localhost", "127.0.0.1", "testserver"]
    max_request_bytes: int = Field(default=65_536, ge=4_096, le=1_048_576)
    # Total characters across all messages; the UI trims history to fit.
    max_conversation_chars: int = Field(default=24_000, ge=4_000, le=200_000)
    max_concurrent_requests: int = Field(default=4, ge=1, le=64)

    @model_validator(mode="after")
    def production_guard(self):
        if self.app_env == "production":
            if self.auth_mode != "azure_container_apps":
                raise ValueError("Production requires AUTH_MODE=azure_container_apps.")
            if "*" in self.allowed_hosts:
                raise ValueError("Production requires explicit ALLOWED_HOSTS.")
        return self

    @property
    def configured(self) -> bool:
        return bool(self.foundry_project_endpoint and self.foundry_agent_name)
