# Olist Foundry agent

The editable YAML is based on the user-supplied **`olist-agent:16`** portal export
(2026-10-03). Its duplicate export blocks were consolidated. The repo contains an
enhanced draft; editing these files does **not** update the active Foundry version.

| File | Purpose |
| --- | --- |
| [agent.yaml](agent.yaml) | Self-contained editable prompt-agent definition, with embedded instructions |
| [agent_instructions.md](agent_instructions.md) | Instruction source for analytics, charts, and aggregate exports |
| [smoke_cases.json](smoke_cases.json) | Manual playground scenarios with trace expectations |

The model deployment remains `gpt-5-mini`, reasoning effort `low`, and both tools
from version 16 are present: PostgreSQL MCP and Code Interpreter with an automatic
container. The MCP URL, `postgres-mcp` project connection, Entra query identity,
and approval policy are retained. The local draft deliberately narrows the MCP
allowlist to `postgres_table_schema_get`, `postgres_list`, and
`postgres_database_query`; confirm these exact names in the deployed tool picker.

Service-managed IDs, identities, status, timestamps, version, and blueprint fields
are omitted from the editable YAML. Voice remains disabled in the portal. This is
a prompt-agent configuration, not an azd hosted-agent manifest. Credentials belong
in the existing authenticated project connection, never in these files.

## Enhancements

- Evidence-backed line charts for trends, horizontal bars for rankings, and separate
  panels for incompatible units. Titles include metric, period, and status scope.
- PNG chart downloads and aggregate CSV exports with explicit scope and units.
- Consistent period comparisons, percentage growth, zero-baseline handling, and
  disclosure of partial periods and missing observations.
- Stable-ID buyer counts, repeat-buyer metrics, category/geography coverage checks,
  and preserved filters across follow-ups.
- Bounded query correction and aggregate result sizes. Customer identifiers are
  withheld from answers and exports; spreadsheet formula-like strings are treated
  as text by the export instructions.

These are agent instructions, not deterministic database or CSV enforcement.
Read-only grants, tool timeouts, SQL restrictions, and disclosure controls still
need enforcement by the MCP service and database. Code Interpreter plots the
verified aggregate results; it must not obtain new warehouse facts or credentials.

## Edit and check locally

```powershell
uv sync --frozen --extra dev
uv run python scripts/sync_foundry_agent.py --write
uv run python scripts/sync_foundry_agent.py
uv run pytest
```

Edit the Markdown for instruction changes and the YAML for model/tool settings.
`--write` embeds the Markdown once in a readable literal block. The check rejects
duplicate YAML keys, stale instructions, unsupported tools, embedded headers,
and an expanded MCP allowlist. It also checks conversion through the installed
Foundry SDK. CI runs this check. This makes no Azure or database calls and cannot
prove remote availability, grants, or numerical correctness.

## Apply to the existing Foundry agent

1. Open `olist-agent` in Foundry and edit a new draft based on version 16. Copy the
   editable `definition` from `agent.yaml`; retain portal-managed fields. If the
   YAML is read-only, paste `agent_instructions.md` into Instructions and match
   the model and tool controls manually.
2. Confirm the three allowlisted MCP tool names and their actual argument schemas,
   the existing `postgres-mcp` connection, and Code Interpreter's automatic container.
3. Run `smoke_cases.json`. Check SQL, status/metric/date scopes, coverage, and generated
   file citations in traces. Verify numbers against approved ground truth in the
   **same database**. In the app, verify the chart loads and PNG/CSV links download.
4. Save as a new version and record the version actually assigned by Foundry. Pin
   `FOUNDRY_AGENT_VERSION` to that reviewed version when releasing the app. `16` is
   the source version, not the version of this enhanced draft. Restart the backend
   after changing its environment. An unset version still follows the latest agent.

The Foundry skill dependency check in this work found `azd` unavailable; no live
deployment or playground invocation was performed.

## Chart and export delivery in the app

The adapter reads `container_file_citation` annotations from assistant messages,
replaces cited sandbox links with same-origin file URLs, and supplies a preview and
download link even when the agent omitted one. History uses the same translation.
Only PNG/CSV files are supported. Images outside this file route are not loaded.

`GET /api/conversations/{conversation_id}/files/{container_id}/{file_id}` first
checks ownership and agent identity, then confirms the exact file is cited by an
assistant message in that conversation. The backend retrieves the bytes using its
Foundry identity. Downloads are bounded to 10 MB, use the existing concurrency gate,
and are not cached or saved locally. CSV is served as an attachment. File IDs alone
do not grant access. Generated files may expire; users can request a fresh chart/export.
The app handles failed previews and rejects incomplete responses or unsupported
MCP approval requests instead of presenting their partial text as a completed answer.

The citation and download flow follows Microsoft's
[Code Interpreter documentation](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/code-interpreter?view=foundry).
The schema supports the existing direct Code Interpreter tool; no toolbox migration
or new infrastructure is part of this change.

## Database scope

The provided agent queries `olist_olap` on server `olist`, a shared **read-only
reference**. Keep its date semantics unverified until supported by lineage or
metadata; do not assume purchase or delivery dates from column names.
Repo warehouse scripts and KNIME ETL remain sandbox-scoped to `olist_olap_abd`.
Never apply sandbox DDL/grants to the shared database or compare its answers with
sandbox ground truth. Log actual database interactions in `logs/db_operations.md`.
This local implementation made none.

The existing evaluation harness still needs numerical scoring, same-database
ground truth, and unresolved-review gating corrected before use as a release gate;
see [the prior review](../docs/agent-review-2026-10-03.md). Offline tests cover app
delivery and configuration behavior, not the deployed agent's analysis quality.
