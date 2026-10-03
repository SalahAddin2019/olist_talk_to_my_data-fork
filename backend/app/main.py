import logging
from contextlib import asynccontextmanager
from typing import Annotated, Literal
from uuid import uuid4

import openai
from azure.core.exceptions import ClientAuthenticationError
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.config import ROOT, Settings
from app.foundry import FoundryAgent

logger = logging.getLogger("olist.api")


class Message(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=32000)


def ends_with_question(messages: list[Message]) -> list[Message]:
    if messages[-1].role != "user" or not messages[-1].content.strip():
        raise ValueError("The last message must be a non-empty user question.")
    return messages


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    messages: Annotated[
        list[Message], Field(min_length=1, max_length=20), AfterValidator(ends_with_question)
    ]


class ChatResponse(BaseModel):
    request_id: str
    answer: str


# Starlette picks the most specific handler, so APIError only catches what is left.
ERRORS: list[tuple[tuple[type[Exception], ...], int, str]] = [
    ((openai.RateLimitError,), 429, "The Foundry agent is rate limited. Try again shortly."),
    ((openai.APITimeoutError,), 504, "The Foundry agent took too long to answer. Try again."),
    (
        (openai.AuthenticationError, openai.PermissionDeniedError, ClientAuthenticationError),
        503,
        "The backend could not authenticate to Microsoft Foundry. "
        "Sign in with az login or check the identity's Azure AI User role.",
    ),
    ((openai.APIError,), 502, "The Foundry agent could not answer. Try again."),
]


def create_app(settings: Settings | None = None, agent=None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logging.basicConfig(level=logging.INFO, format="%(message)s")
        app.state.agent = agent or (FoundryAgent(settings) if settings.configured else None)
        try:
            yield
        finally:
            if app.state.agent:
                await app.state.agent.close()

    app = FastAPI(
        title="Olist Foundry Chat",
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request.state.request_id = uuid4().hex
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Cache-Control"] = "no-store"
        if not request.url.path.startswith("/api/docs"):
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
                "frame-ancestors 'none'; base-uri 'self'"
            )
        return response

    def error(request: Request, status: int, message: str) -> JSONResponse:
        return JSONResponse(
            status_code=status,
            content={"error": message, "request_id": request.state.request_id},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        # The default handler echoes the input back; questions may be sensitive.
        return error(request, 422, "Send 1–20 messages of at most 32,000 characters each.")

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        return error(request, exc.status_code, exc.detail)

    for types, status, message in ERRORS:

        async def handler(request: Request, exc: Exception, status=status, message=message):
            logger.warning(
                "foundry_error request_id=%s type=%s",
                request.state.request_id,
                type(exc).__name__,
            )
            return error(request, status, message)

        for exc_type in types:
            app.add_exception_handler(exc_type, handler)

    @app.get("/api/health")
    async def health():
        return {
            "status": "ok",
            "configured": settings.configured,
            "agent": settings.foundry_agent_name or None,
        }

    @app.post("/api/chat", response_model=ChatResponse)
    async def chat(body: ChatRequest, request: Request):
        if request.app.state.agent is None:
            raise HTTPException(
                503,
                "Foundry is not configured. Set FOUNDRY_PROJECT_ENDPOINT and "
                "FOUNDRY_AGENT_NAME in the backend environment and restart the server.",
            )
        answer = await request.app.state.agent.ask(
            [message.model_dump() for message in body.messages]
        )
        if not answer.strip():
            raise HTTPException(502, "The Foundry agent returned an empty answer. Try again.")
        return ChatResponse(request_id=request.state.request_id, answer=answer)

    # One same-origin container in production, Vite proxy during local development.
    frontend = ROOT / "frontend/dist"
    if frontend.is_dir():
        app.mount("/", StaticFiles(directory=frontend, html=True), name="frontend")
    return app


app = create_app()
