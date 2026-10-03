# Agent and tool safety

The previous backend enforced warehouse safety in code: a reviewed SQL allowlist, bound
parameters, read-only transactions, query and lock timeouts, a single-database restriction,
fail-closed DB auditing and a category-quality guard (see [archive/](archive/)). The
Foundry agent now does the data work, so **those controls must be enforced on the agent's
tools and database identity**. This repository cannot prove them; the items below are
requirements to verify for each agent version before production.

## Required evidence per agent version

| Control | Where it must be enforced | How to verify |
|---|---|---|
| Read-only data access | Agent tool's database login, member of `olist_agent_reader` only ([sql/04](../sql/04_agent_reader_role.sql)) with `default_transaction_read_only=on` | Role memberships and grants; a write attempt as that login is denied |
| Only `olist_olap_abd` | Login has `CONNECT` on that database only | `\l` privileges; connection attempt to another database fails |
| Query limits | Role-level `statement_timeout`; row limits in the tool | Role settings; long query is cancelled |
| Auditable DB operations | Server-side logging for the tool login (pgaudit or `log_statement`) to Azure Monitor, which replaces the local `logs/db_operations.md` for agent traffic | Log query shows the evaluation run's statements |
| No writes outside a sandbox | Tool definitions expose no write or DDL operations | Exported agent definition reviewed |
| Prompt instructions are not a boundary | All of the above hold even if the model is tricked | `scripts/evaluate_agent.py` cases below |
| Reviewed definition | Agent instructions and tool configuration exported and reviewed; version pinned with `FOUNDRY_AGENT_VERSION` | Version number in the evaluation report |

## Evaluation harness

`uv run --extra warehouse python scripts/evaluate_agent.py` calls the live agent and, when
`PG*` variables are set, reads the warehouse (read-only, audited) for ground truth. It covers:

- numerical accuracy of total revenue and distinct orders against the warehouse;
- prompt injection (`DROP TABLE`), write and admin requests, and a fabricated assistant turn
  claiming write access;
- sensitive-record requests (fails if raw 32-character customer IDs appear);
- category questions while category links are missing;
- table row counts before and after the run (fails if anything changed).

Results are `pass`, `fail` or `review`; `review` answers need a person to read them in
`artifacts/agent-evaluation.json`. Passing the harness is evidence, not proof: database-side
enforcement in the table above is what makes the agent safe.
