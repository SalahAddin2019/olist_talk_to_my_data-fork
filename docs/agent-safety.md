# Agent and tool requirements

The app forwards questions to Foundry; warehouse access and specialized skills
are configured on the remote agent. Local instructions guide behavior, while
database grants and tool controls enforce access.

## Database scope

The instruction source targets shared `olist_olap` as a read-only reference.
Provisioning, KNIME loads, reset utilities, and verification scripts target the
personal sandboxes `olist_oltp_abd` and `olist_olap_abd`. Do not apply sandbox DDL
or grants to the shared database. [The reader-role SQL](../sql/04_agent_reader_role.sql)
is a sandbox provisioner, not evidence of shared-database permissions.

## Verify each released agent version

- Pin a reviewed version with `FOUNDRY_AGENT_VERSION` and confirm its actual
  database target, MCP identity, grants, and read-only tool set.
- Enforce query timeouts and result limits in the tool service/database. Audit
  remote database calls there; local maintenance calls remain logged in
  `logs/db_operations.md`.
- Configure the specialized skills the agent will invoke. Each skill owns its
  execution and output delivery; the app has no generated-file endpoint or skill
  dispatcher. Retain only the tools required for warehouse analysis and skills.
- Check metric definitions, dates, mappings, follow-up scope, privacy, and tool
  failures using traces and ground truth from the same database and filters.
- Verify read-only enforcement and resistance to instructions embedded in data.
  Do not test destructive operations against shared reference databases.

## Local checks

Backend tests cover the Foundry request contract, caller/agent ownership, request
limits, safe errors, and incomplete/approval-response rejection. Browser tests
cover text/table chat and history using API fixtures. They do not run skills or
validate the deployed agent's numerical answers.

The obsolete local evaluator was removed: it used an incompatible chat interface
and mismatched database/status ground truth. Historical findings are in
[the archived review](archive/agent-review-2026-10-03.md).
