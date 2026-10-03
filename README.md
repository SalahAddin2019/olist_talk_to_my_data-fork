# Talk to the Olist data

A React + TypeScript chat UI and a thin FastAPI backend that routes every question to a
**Microsoft Foundry agent** (`olist-agent`). The agent owns the instructions, tools and
data access; this app handles the conversation UI, configuration and safe error handling.

## Run locally

Requires Python 3.11–3.13, [uv](https://docs.astral.sh/uv/), Node.js 22+, the
[Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli), and the **Azure AI User**
role on the Foundry project.

1. Copy `.env.example` to `.env` and set `FOUNDRY_PROJECT_ENDPOINT` and `FOUNDRY_AGENT_NAME`
   (optionally `FOUNDRY_AGENT_VERSION`; unset means the latest version).
2. Sign in so the backend can get a Microsoft Entra token: `az login`.
3. From the repository root, start the backend:

   ```powershell
   uv sync --frozen --extra dev
   uv run python -m app
   ```

4. In another terminal, start the UI:

   ```powershell
   cd frontend
   npm ci
   npm run dev
   ```

5. Open **http://127.0.0.1:5173**. API health: **http://127.0.0.1:8000/api/health**.
   API docs: `/api/docs`.

For a single process, run `npm run build` in `frontend`, then start the backend and open
**http://127.0.0.1:8000**. `docker compose up --build` runs the same app on localhost:8000;
a container has no `az login`, so give it a service principal through `AZURE_TENANT_ID`,
`AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET` in `.env`, or a managed identity in Azure.

## Design

```mermaid
flowchart LR
    UI[React UI] -- conversation --> API[FastAPI /api/chat]
    API -- Responses API + agent_reference --> Agent[Foundry agent olist-agent]
    Agent --> API --> UI
```

- The backend uses the official [`azure-ai-projects`](https://pypi.org/project/azure-ai-projects/)
  SDK: `AIProjectClient.get_openai_client()` and `responses.create(...)` with an
  `agent_reference`, as in the
  [Foundry quickstart](https://learn.microsoft.com/azure/foundry/quickstarts/get-started-code).
- Authentication is Microsoft Entra ID through `DefaultAzureCredential`. Foundry agents do not
  accept API keys, so no secret is stored in the repository or sent to the browser.
- The browser keeps the conversation (up to 20 messages) and sends it with each question, so the
  backend is stateless. Reloading the page or starting a new conversation clears it.
- Answers are rendered as Markdown (tables included) without raw HTML.
- Foundry errors map to short messages (429 rate limit, 503 authentication, 504 timeout,
  502 other) with a request ID. Questions are never echoed in validation errors or logs.

## Validation

```powershell
uv run pytest
uv run ruff check backend
cd frontend
npm run build
npm run test:e2e   # needs the built app running on port 8000 and Microsoft Edge
```

`backend/tests/test_foundry.py` checks the exact request sent to Foundry (URL, Entra token
scope and `agent_reference` body) against a mocked transport. Browser tests use API fixtures,
so they do not call Foundry.

## Project map

- `backend/app/`: settings, Foundry client and API.
- `frontend/src/`: conversation UI and Markdown answer rendering.
- `knime/`, `sql/`, `scripts/`, `pipeline/`, `dataset/`, `linkedService/`, `factory/`: the
  warehouse ETL (KNIME and Azure Data Factory) that loads `olist_olap_abd`.
- `docs/decisions.md`: decision log.
