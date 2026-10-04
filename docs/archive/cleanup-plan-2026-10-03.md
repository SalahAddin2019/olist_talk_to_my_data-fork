> Historical record before the core-chat cleanup. File locations, line numbers,
> capabilities, and test counts below describe that earlier state.

# Core chat cleanup review and plan

Reviewed 2026-10-03 at commit `c85a2e7`.

The requested ownership boundary is explicit: a specialized skill owns all
visualization and export work. This app retains warehouse question answering as
text and ordinary Markdown tables, with Foundry conversation management.
This document is a plan; no application code or remote resources were changed.

## Required functionality

- Send a question to the configured Foundry agent and support follow-ups.
- Display text and Markdown tables without inferring a chart from their contents.
- Create, list, reopen, and delete the caller's conversations.
- Preserve authentication, conversation ownership, safe errors, request limits,
  concurrency limits, and rejection of incomplete or approval-dependent answers.
- Serve the UI locally and from the existing container build.
- Keep the sandbox warehouse's source data, canonical SQL, KNIME workflows, and
  audited maintenance/verification utilities.

No chart renderer, generated-file proxy, export endpoint, Code Interpreter prompt
instructions, skill router, or replacement visualization framework belongs here.
The future skill integration is outside this cleanup.

## Findings

| Priority | Evidence | Finding and consequence |
| --- | --- | --- |
| High: ownership | `microsoft_foundry/agent_instructions.md:269` and `:296` | The prompt requires Code Interpreter, matplotlib, chart selection, dashboards, PNG citations, and aggregate CSV exports. At line 273 it also requests charts proactively. These are the main instructions making the analytics agent responsible for visualization. |
| High: duplicate presentation | `frontend/src/Answer.tsx:7`, `frontend/src/components/AnswerTable.tsx:9`, `frontend/src/table.ts:34` | Every suitable numeric Markdown table is converted into a chart, with chart view selected by default. This happens independently of agent-generated images. The heuristic has no metric semantics: a numeric identifier can become a measure, and time series become horizontal bars. Negative values are deliberately rejected by the number parser. |
| Medium: answer mutation | `backend/app/artifacts.py:39` | The backend rewrites cited sandbox links and adds PNG images and PNG/CSV download links when absent. It changes the presentation of the agent's answer instead of simply forwarding its text. |
| Medium: transport coupling | `backend/app/foundry.py:141`, `backend/app/main.py:242`, `frontend/src/Answer.tsx:22` | Generated files require citation scanning, container downloads, file limits, format checks, API routing, and preview failure state. These pieces serve the visualization/export feature and can be removed together under the new ownership boundary. |
| High: broken maintenance command | `scripts/evaluate_agent.py:101`, `backend/app/foundry.py:64` | Evaluation calls `agent.ask(messages)`, but the adapter requires `(question, conversation_id, user)` and returns a tuple. The old harness fails each case before a valid agent request. Its fabricated assistant-history scenario also assumes an interface that no longer exists. |
| High: misleading evaluation | `scripts/evaluate_agent.py:24`, `:46`, `:137`; `scripts/warehouse.py:23`; `microsoft_foundry/agent_instructions.md:48`, `:133` | Ground truth reads sandbox `olist_olap_abd` across all statuses; the prompt targets shared `olist_olap` and defaults revenue to delivered orders. Number matching can accept unrelated numbers, and unresolved `review` results allow a zero exit status. Repairing only the function call would leave the harness unsuitable as a correctness gate. |
| High: competing ETL | `pipeline/pl_oltp_to_olap_1.json`, `linkedService/ls_pg_olap.json:11` | The ADF pipeline prepares tables and loads dimensions/facts through a connection targeting shared `olist_olap`. That is a second transformation path and conflicts with this repository's KNIME-only sandbox loading rule. These are local exported definitions; their current remote execution status was not inspected. |
| Medium: stale documentation | `docs/decisions.md:109`, `docs/agent-safety.md:15`, `README.md:115`, `sql/README.md:21` | Active docs still describe the deleted YAML sync workflow, a sandbox-only agent policy that conflicts with its instructions, the broken evaluator, and legacy archive paths absent from this checkout. |
| Low: inconsistent limits | `frontend/src/components/Composer.tsx:4`, `backend/app/main.py:31` | The UI accepts 2,000 characters while the API accepts 4,000. Align the UI with the existing API contract. |
| Medium: error contract | `backend/app/main.py:185`, `:214` | Busy chat responses construct `Retry-After`, but the HTTPException handler drops exception headers. Preserve those headers through the shared error response. |

The live chat request itself does not inject visualization instructions:
`backend/app/foundry.py:76` sends the user's question and an agent reference.
Editing local Markdown does not update the configured remote Foundry agent.

## Implementation order

### 1. Remove visualization and export responsibilities from the instructions

- Remove the complete Visualizations and Aggregate exports sections.
- Remove Code Interpreter policy at lines 37-39 and rewrite cross-references at
  lines 172, 198-199, 210, and 233-235 so analytics rules stand on their own.
- Keep metric definitions, grain/joins, status/date scope, evidence requirements,
  query bounds, data-quality checks, and limits on disclosure. These support
  correct warehouse answers even when charts and exports disappear.
- Consolidate duplicated retry/default-row instructions within the Markdown.
  Do not replace business rules with a generic short prompt.
- The resulting agent produces concise text and useful tables. A chart/export
  request should receive an honest capability response, not invented files.

The remote agent must receive the revised instructions and have its Code
Interpreter visualization/export tool removed as part of a separate Foundry
configuration update. Review the resulting version and pin the app to it.
Removing repository code alone cannot remove remote capabilities. Historical
answers may still mention files; their prose can remain, but this app will no
longer preview or retrieve those files.

### 2. Remove automatic charting and image handling from the UI

- Delete `frontend/src/table.ts` and the chart/number-parsing tests.
- Move the independent `toTurns` test from `table.test.ts` to `history.test.ts`,
  then delete `table.test.ts`.
- Replace `AnswerTable.tsx` with a small scrollable table wrapper, retaining
  keyboard access, the region label, and ordinary table content.
- Remove `ChartImage`, artifact URL recognition, image state, and chart fallback
  copy from `Answer.tsx`. Explicitly omit Markdown images rather than falling
  back to react-markdown's default image renderer.
- Remove chart color tokens from `styles.css`; keep ordinary Markdown/table
  styles, responsive layout, and accessibility support.
- Replace the chart/CSV suggested question and remove chart/export promises
  from `EmptyState.tsx`.
- Remove chart toggles, numeric-series assertions, generated-file download
  fixtures, and expired-preview cases from `frontend/e2e/app.spec.ts`.
- Retain or add an end-to-end assertion that a numeric answer stays a table.

### 3. Remove generated-file backend support completely

- Delete `backend/app/artifacts.py`.
- Remove `ArtifactNotFound`, `ArtifactTooLarge`, and `FoundryAgent.artifact()`.
- Replace `message_text()` imports with a small text-only extraction helper in
  `foundry.py`, shared by immediate answers and conversation history. Preserve
  joining of multiple assistant messages and filtering of tool items.
- Remove the `/api/conversations/{conversation_id}/files/{container_id}/{file_id}`
  route, both artifact error handlers, and their imports/constants.
- Delete file-citation, download-ownership, size/expiration, and download-header
  tests in `test_foundry.py` and `test_api.py`.
- Preserve `AnswerIncomplete` tests and behavior; change chart-specific wording
  in those fixtures to ordinary analytics questions.
- Add a regression assertion that no generated-file route remains.

Do not keep a generic artifact subsystem as a placeholder for the future skill.

### 4. Remove obsolete maintenance paths and reconcile documentation

- Delete the incompatible `scripts/evaluate_agent.py`; remove its README command
  and the claims that it evaluates the current agent in `docs/agent-safety.md`.
  Keep deterministic chat/ownership/error tests. A future analytics evaluation
  belongs in a dedicated, correctly scoped evaluation effort.
- Delete the alternate ADF exports: `pipeline/`, `dataset/`, `linkedService/`,
  `factory/`, and `publish_config.json`. This deletes local definitions only.
  Git history retains their provenance; no remote ADF resources are changed.
- Remove redundant non-sandbox schema copies
  `sql/01_olist_oltp_schema.sql` and `sql/02_olist_olap_schema.sql` after confirming
  canonical `_abd` provisioning and workflow references. Preserve the numbered
  sandbox DDL and reader-role SQL.
- Consolidate reset instructions around `scripts/reset_olap_abd.sh`; remove
  `scripts/az/az_reset_olap.txt` and the duplicate truncate SQL after verifying
  no retained workflow depends on them. Keep the audited sandbox reset path.
- Keep `scripts/warehouse.py`, `verify_warehouse.py`, and
  `inspect_category_keys.py`: they have independent sandbox maintenance purposes
  and do not participate in chat or visualization.
- Rewrite active README/design/safety docs around the final text/table app.
  Mark superseded decision entries and append the new ownership decision.
  Reconcile the shared agent reference database with sandbox-only ETL/maintenance
  documentation without silently changing any database identity or grants.
- Move superseded review/validation writeups into `docs/archive/` and repair
  links, retaining a small active documentation set. Archive documents may
  describe historical visualization behavior; they are not runtime capability.
- Review dependencies after deletions using direct imports and build results.
  Keep React Markdown/GFM for text and tables, and Azure/OpenAI dependencies
  required by the remaining adapter. There is no installed chart library to
  remove. Avoid replacing the SDK or UI framework just to reduce file count.

### 5. Simplify the retained application where it improves functionality

- Align the composer length with the API and preserve Retry-After headers.
- Keep request/cancellation logic small and prevent stale asynchronous results
  from changing a newly opened conversation.
- Document the existing Stop action as stopping browser waiting; there is no
  explicit remote generation cancellation call. Avoid claiming it saves quota.
- Replace the sidebar's configured-based Connected claim with Configured;
  `/api/health` checks settings, not a live Foundry connection.
- Remove the static warehouse subject-area chips if reducing the sidebar; they
  are hard-coded marketing copy rather than discovered capabilities.
- Preserve mobile navigation, keyboard operation, theme support, and readable
  styling. Do not couple this deletion effort to a full UI rewrite.
- Leave untracked personal outputs (`.deck-build/`, `outputs/`, `Untitled`) out
  of commits and deletion lists; they are not established application code.

## Acceptance checks

1. Backend pytest, Ruff, frontend unit tests, TypeScript/Vite build, and changed
   file formatting checks pass. Update lockfiles only for changed dependencies.
2. Browser fixtures verify new chat, follow-up, ordinary numeric tables, history
   reopening/deletion, safe failure/retry, mobile navigation, and keyboard use.
3. Backend tests retain cross-user rejection for follow-ups/history/deletion,
   request/concurrency limits, no question echoing, incomplete-answer rejection,
   and mocked Foundry request/response contracts.
4. Search runtime code, instructions, and active capability docs for lingering
   chart inference, matplotlib, Code Interpreter, container-file citations,
   PNG/CSV download claims, and generated-file routes. Remove production
   references; intentional regression tests can mention removed behavior.
5. Compare chat and reopened history for consistent text/table output. Check
   old conversations degrade to readable prose without image/file retrieval.
6. Record revised remote instructions/tool settings and the reviewed version
   when the separate Foundry configuration update is performed. Verify chart
   requests do not trigger visualization/export tools in that version.

## Review validation and limits

Current baseline: 39 backend tests passed, Ruff passed, 16 frontend unit tests
passed, and the TypeScript/Vite production build passed. These results do not
exercise the obsolete evaluator or establish live agent accuracy. Browser tests
were inspected but not run during this review.

No database queries, remote Foundry calls, or remote deployment/ADF changes were
performed. KNIME archives were inventoried but not executed or audited node by
node; reference checks are required before deleting duplicate operational files.
