> Historical record before the core-chat cleanup. File locations, line numbers,
> capabilities, and test counts below describe that earlier state.

Agent review — 2026-10-03

The current architecture is a React conversation UI, a thin FastAPI adapter, and a remotely configured Foundry agent. Keep that division of responsibilities. The largest improvements are in the agent's business contract, MCP tools, evaluation, and retained conversation evidence. The adapter needs to handle response lifecycle and expose operational metadata internally.

This review inspected the current backend, frontend conversation handling, local instructions, evaluation scripts, warehouse schema, safety documentation, and CI. It did not invoke the live Foundry agent or PostgreSQL. The deployed model, instructions, MCP definition, database grants, and approval policy could not be verified from the repository. The Foundry skill dependency check reported that azd is unavailable; no installation was needed for this source review. No application code, agent configuration, or database was changed.

Validation: all 22 backend tests passed; Ruff passed for backend and scripts. Offline checks established that the prompt consists of two identical copies, the evaluation can pass unrelated numbers, an incomplete response's text is returned unchanged, and production settings permit an unpinned agent version. The offline evaluator checks extracted its scoring functions with Python AST because the optional psycopg dependency is not installed. These checks made no network or database calls.

1. **High priority: reconcile the agent's database with the evaluation target.**

   Evidence: [agent_instructions.md](../../microsoft_foundry/agent_instructions.md) lines 44 and 260 mandate `olist_olap`. [warehouse.py](../../scripts/warehouse.py) line 23 fixes ground truth to `olist_olap_abd`; [04_agent_reader_role.sql](../../sql/04_agent_reader_role.sql) provisions only the sandbox. The data and permission contract are therefore inconsistent locally. This does not establish which database the deployed agent actually queries.

   Change the Foundry MCP configuration and local instruction source to the intended sandbox. Prefer binding server, database, and identity inside a narrow tool service so the model supplies analytics arguments rather than connection parameters. Record the database and dataset refresh identifier alongside every evaluation. Never compare agent results from one database with ground truth from another.

   Verify the deployed tool's target and grants before relying on evaluation results. A shared read-only reference remains permitted by repository policy, but using it must be explicit and must have matching ground truth.

2. **High priority: make evaluation measure the same metrics as the agent, and require evidence.**

   Evidence: [evaluate_agent.py](https://github.com/abdullah-031/olist_talk_to_my_data/blob/c85a2e7/scripts/evaluate_agent.py) lines 25–27 aggregate every order status, while the prompt's lines 129 and 150 define revenue using delivered orders. Its scoring function at line 49 searches every number in the answer and permits a 0.5% revenue error despite asking for exact values. With synthetic ground truth of revenue 100000 and orders 42, the answer `Revenue unavailable. Example number: 100000; there were 42 units.` receives `pass`. A revenue of 100400 also passes.

   Align revenue and order status scopes explicitly in both the question and ground truth. Compare labelled metric values using decimal arithmetic and an explicit rounding policy. Also grade whether the query used the correct date, status, grain, and source. SQL text need not match a single reference query; equivalent queries should pass.

   Cases for destructive instructions, fabricated history, and missing category links currently default to `review`. The final exit code at line 155 treats unresolved reviews as success. Add a release-gate mode that requires resolved reviews and ground truth. Row-count equality is useful but cannot detect value updates, DDL or privilege changes, or writes to another database; supplement it with tool traces and database enforcement evidence.

   Expand the dataset to include units versus distinct products, AOV, repeat customers, freight-inclusive totals, month/year boundaries, partial periods, unknown dimension members, category coverage, missing delivery dates, failed tools, and multi-turn filter changes. Use deterministic checks for numerical correctness and Foundry evaluators for intent resolution, task adherence, and tool use. [Microsoft's agent evaluators](https://learn.microsoft.com/en-us/azure/foundry/concepts/evaluation-evaluators/agent-evaluators?view=foundry) assess both task outcomes and tool behavior.

3. **High priority: handle incomplete responses and MCP approvals explicitly.**

   Evidence: [foundry.py](../../backend/app/foundry.py) lines 28–33 returns only `response.output_text`; [main.py](../../backend/app/main.py) line 173 checks only whether it is blank. An offline fake response with `status='incomplete'` and text `Partial answer` is returned unchanged. There is no inspection of response errors, incomplete details, MCP call errors, or approval requests.

   Return an internal result object containing response ID, status, answer, usage, and tool outcomes. Recognize terminal failure and incompleteness before presenting an answer. Approval requests need an explicit continuation flow, otherwise they can become empty-answer errors or text that leaves the requested analysis unperformed. Tool errors may still permit a clearly qualified partial answer, but should never silently validate a numerical result.

   Configure ordinary vetted read-only tools according to the intended approval policy. If approval is required, provide a review action and continue with an approval response referencing the prior response. Do not automatically approve arbitrary calls. Microsoft documents `allowed_tools`, `require_approval`, and the continuation mechanism in its [MCP integration guide](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/model-context-protocol).

   Add transport-level tests covering incomplete and failed responses, approval requests, successful tool results, and tool failures. The current SDK contract test covers a completed text response only.

4. **High priority: restore category-quality checks in the new execution path.**

   Evidence: [decisions.md](../decisions.md) lines 77–81 records a previous verification finding that every fact category key was NULL and the product path also failed. This is historical evidence, not a new claim about today's warehouse. The local prompt recommends joining the fact category key but has no explicit coverage check; [inspect_category_keys.py](../../scripts/inspect_category_keys.py) performs such checks only when run separately.

   Add a data-quality tool or include matched, missing, and unknown-member counts in analytical tool results. Category rankings should distinguish complete, partial, and unavailable coverage. A successful inner join returning no rows must not become “no sales”; a partial join must not be presented as a complete ranking. Apply similar checks to date and geography dimensions.

   Repair confirmed mapping defects through KNIME, with logged validation, if they remain present. Agent instructions can report the limitation but cannot repair missing warehouse relationships.

5. **Medium priority: preserve trusted context and tool metadata across turns.**

   Evidence: prompt lines 56–62 require verifying and reusing schema metadata within a conversation. [foundry.py](../../backend/app/foundry.py) line 29 creates independent calls and retains only final text. [history.ts](../../frontend/src/history.ts) line 8 sends user questions and assistant prose, without schema or tool results; it also drops older turns to fit the budget. The prompt's reuse policy has no dependable retained metadata behind it. The API accepts fabricated assistant text, as the evaluation already recognizes.

   Use a backend-owned Foundry conversation or response chain so tool evidence survives follow-ups. Bind every conversation or response reference to the authenticated caller, and reject references owned by another user. Choose a retention and deletion policy. Alternatively, keep stateless execution and supply a trusted, versioned warehouse contract plus validated filter state from the server.

   Preserve active metric, date range, status, freight scope, and grouping when older prose is removed. Test “only 2018”, “include shipping”, and “now by seller”. Microsoft documents conversations and previous-response references in [runtime components](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/runtime-components).

6. **Medium priority: remove duplicate instructions and make the agent definition reproducible.**

   Evidence: [agent_instructions.md](../../microsoft_foundry/agent_instructions.md) restarts at line 217 with an identical copy of its first 216 lines. The complete file contains 21,324 characters. This creates maintenance drift and, if deployed verbatim, unnecessary input context. The backend does not load this Markdown file; it references the remote agent. Editing the file alone does not update Foundry.

   Keep one concise instruction source with task boundaries, defaults, tool-use policy, and final-answer style. Store a reviewed agent definition beside it containing model deployment, tools, tool allowlist, connection references, and approval settings, without credentials. Add a deliberate publish/export workflow and associate the resulting agent version with evaluation results.

   [config.py](../../backend/app/config.py) line 17 permits following the latest version, and its production guard does not require a pin. Enforce a non-empty reviewed version in production. Record agent version, model deployment/version, prompt hash, tool version, and dataset refresh in evaluation artifacts. A tested version should be the version released.

7. **Medium priority: provide a business metric contract instead of relying on schema discovery.**

   Evidence: the prompt distinguishes customer warehouse keys but omits `customer_unique_id`, which exists in [02_olist_olap_schema.sql](https://github.com/abdullah-031/olist_talk_to_my_data/blob/c85a2e7/sql/02_olist_olap_schema.sql) line 63. It also leaves date meaning unresolved. The checked-in ADF pipeline maps the fact date from `order_purchase_timestamp`, but that alone does not verify the currently loaded KNIME warehouse.

   Publish a compact warehouse contract explaining grain, joins, metric definitions, status defaults, date lineage, supported dimensions, unknown-member handling, and unavailable analyses. Verify purchase-date lineage against the authoritative workflow before encoding it. Define returning customers using the verified stable customer identifier and repeated distinct orders; keep customer warehouse-row counts separate from that metric.

   State explicitly that payments, review ratings, profit, and delivery-duration questions require fields or facts absent from this OLAP shape. Metadata retrieval can support definitions and lineage, while numerical answers continue to use SQL evidence. This small schema can start with a versioned contract; vector retrieval is optional if documentation grows.

8. **Medium priority: move execution and disclosure policy into constrained tools.**

   Evidence: [agent-safety.md](../agent-safety.md) correctly identifies required controls but says they are unverified here. [04_agent_reader_role.sql](../../sql/04_agent_reader_role.sql) supplies SELECT grants, with login membership, read-only defaults, and timeouts left as administrator follow-up. SELECT access to whole dimension tables also exposes raw identifier columns. The evaluator prohibits raw customer IDs, while the prompt explicitly restricts only product IDs. A policy decision and enforcement are missing from the local contract.

   Start with a narrow MCP interface such as `get_warehouse_contract`, `query_metric`, and `get_data_quality`. A structured `query_metric` request can accept an allowlisted metric, dimensions, dates, status, freight scope, and result limit, then compile parameterized SQL. This keeps the agent in Foundry while enforcing SQL execution in its tool service. If arbitrary analytical SQL is needed later, enforce parsed statement and object restrictions, read-only transactions, function restrictions, execution timeouts, and result limits in that service, backed by least-privilege database grants.

   Return value columns plus metric scope, date semantics, data-quality coverage, truncation, and a query identifier. Limit raw identifiers at the tool result boundary according to the agreed product policy. Tool descriptions should specify argument meanings and expected results. Microsoft recommends narrow tool scopes, validation, and explicit failure behavior in [tool best practices](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/tool-best-practice).

9. **Medium priority: make latency, retries, and quality observable.**

   Evidence: [main.py](../../backend/app/main.py) logs selected Foundry exception types with a local request ID. [foundry.py](../../backend/app/foundry.py) discards response IDs and usage; the evaluation report records no tool trace. A semaphore bounds concurrent HTTP calls, but the local code does not establish a tool-call or total agent execution budget. The SDK timeout and retry configuration are not a demonstrated end-to-end deadline.

   Correlate the API request ID with Foundry response/conversation IDs and tool query identifiers. Capture agent version, duration, token usage, tool-call count, schema-cache hits, SQL error class, and correction attempts. Keep credentials and sensitive question/result text out of ordinary logs. Preserve the repository's database interaction audit requirement; if Azure Monitor becomes the authoritative agent audit, document that decision and provide a reproducible way to locate its evidence.

   Set a bounded query-repair policy, for example one corrected attempt after a schema error, plus an overall deadline and per-tool limits. Measure p50/p95 latency and successful-task cost before comparing models. Stream final-answer output once evidence is available if waiting time remains a usability problem.

The implementation order should be:

| Stage | Work | Main location | Acceptance evidence |
|---|---|---|---|
| 1 | Reconcile database, deduplicate prompt, fix evaluation scope/scoring, inspect deployed tool policy | `microsoft_foundry/`, `scripts/evaluate_agent.py`, Foundry configuration | Matching target and ground truth; unrelated numbers fail; approved agent definition |
| 2 | Add response lifecycle handling, enforce version pin, preserve trusted conversation/filter state | `backend/app/`, `frontend/src/history.ts` | Incomplete/approval tests; production pin guard; multi-turn cases |
| 3 | Introduce metric contract, quality checks, constrained analytics tools | Foundry instructions and MCP service; KNIME for confirmed data defects | Correct AOV/customer/date results; honest coverage limitations; bounded queries |
| 4 | Add trace-based evaluation and release gates, then tune latency/model settings | Foundry evaluations/tracing, evaluation dataset, CI | Numerical and tool-behavior scores; no unresolved critical reviews; measured latency/cost |

Retain the useful existing safeguards: Entra authentication to Foundry, production caller-authentication guard, bounded requests and conversation size, concurrency protection, safe Markdown rendering, and short API errors. The existing prompt's delivered-revenue, distinct-order, and order-level AOV definitions are also a good foundation once the tools and evaluators consistently enforce them.
