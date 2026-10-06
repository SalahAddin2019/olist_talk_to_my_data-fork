> Historical record before the core-chat cleanup. File locations, line numbers,
> capabilities, and test counts below describe that earlier state.

# Agent visualization enhancements — local validation

Source: the user-supplied `olist-agent:16` export. The editable YAML keeps the
`gpt-5-mini` deployment, low reasoning effort, supplied MCP endpoint/connection,
and automatic Code Interpreter container. It adds an explicit three-tool MCP
allowlist and enhanced analytics/visualization instructions. Service-generated
version and identity fields are omitted; duplicate export blocks are consolidated.

The YAML definition, sync script, configuration tests, and manual smoke-case file
were subsequently removed. Only
[agent_instructions.md](../../microsoft_foundry/agent_instructions.md) remains in the
Foundry folder. The results below record validation before that cleanup.

## Checks performed

| Check | Result |
| --- | --- |
| Instruction embedding, YAML contract, SDK conversion | Pass |
| Ruff, backend and scripts | Pass |
| Backend/configuration tests | 45 passed |
| Frontend unit tests | 16 passed |
| TypeScript and Vite production build | Pass |
| Edge browser tests against the built UI with API fixtures | 13 passed |
| Formatting of changed UI/test files | Pass |
| Repository-wide frontend formatting | Reports pre-existing issues in 14 untouched files |
| Git whitespace check | Pass |

Backend tests exercise the installed SDK with a mocked HTTP transport. They cover
file citations in chat/history, exact file-to-conversation binding, ownership
rejection, streamed file limits, expiration, incomplete/approval response rejection,
and omission of incomplete assistant messages from history. API tests verify caller
identity, safe errors, inline PNG previews, PNG/CSV download headers, and no caching.

Browser tests confirm that generated PNGs load, PNG/CSV links actually initiate
downloads with the expected filenames, previews survive reopening history, expired
images show guidance, and mobile layouts fit the viewport. The browser fixtures use
synthetic values and a tiny PNG to test delivery; they do not evaluate chart aesthetics
or the deployed agent's numerical accuracy. Existing chat/history/theme tests pass.

## Release limits

No live Foundry agent was invoked or updated, and no database interaction occurred.
The Foundry skill dependency check reported missing `azd`; local source work used the
installed Python SDK and existing app tools. The enhanced instructions still require
playground regression checks against `olist_olap`, remote MCP-name/permission checks,
and a new reviewed Foundry version. The repo's sandbox evaluation harness cannot be
used as same-database ground truth without further work.

Read-only execution, data-disclosure rules, query budgets, and CSV formula protection
are prompt policies that need service/database enforcement and live evaluation. App
download ownership, citation binding, supported file types, concurrency, and the 10 MB
limit are enforced in code. Generated Foundry files can expire.

Copy [the agent instructions](../../microsoft_foundry/agent_instructions.md) into the
Foundry portal's Instructions field, save a reviewed version, and pin that version
with `FOUNDRY_AGENT_VERSION`. Version 16 remains the source
reference; the new remote version has not yet been assigned.
