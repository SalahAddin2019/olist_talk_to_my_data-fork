"""Validate the local prompt-agent YAML; --write embeds the instruction source.

No Azure credentials or network calls. Run with the project's dev dependencies.
"""

import argparse
from pathlib import Path

import yaml
from azure.ai.projects.models import PromptAgentDefinition

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "microsoft_foundry/agent.yaml"
INSTRUCTIONS = ROOT / "microsoft_foundry/agent_instructions.md"
HEADER = (
    "# Editable prompt-agent configuration, based on the supplied olist-agent:16 export.\n"
    "# This is not an azd hosted-agent manifest. Foundry assigns version and identity fields.\n"
    "# Edit agent_instructions.md, then run scripts/sync_foundry_agent.py --write.\n"
)


class UniqueKeyLoader(yaml.SafeLoader):
    """Reject duplicate mappings instead of silently accepting a repeated export."""


def unique_mapping(loader, node):
    loader.flatten_mapping(node)
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node)
        if key in result:
            raise ValueError(f"Duplicate YAML key: {key}")
        result[key] = loader.construct_object(value_node)
    return result


UniqueKeyLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)


class LiteralDumper(yaml.SafeDumper):
    """Keep embedded instructions readable and ready for copying to the portal."""


def string_scalar(dumper, value):
    return dumper.represent_scalar(
        "tag:yaml.org,2002:str", value, style="|" if "\n" in value else None
    )


LiteralDumper.add_representer(str, string_scalar)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Embed Markdown instructions in YAML.")
    args = parser.parse_args()
    document = yaml.load(CONFIG.read_text(encoding="utf-8"), Loader=UniqueKeyLoader)
    if not isinstance(document, dict) or set(document) != {"name", "description", "definition"}:
        raise SystemExit(
            "Keep only name, description, and definition; omit service-generated fields."
        )
    definition = document["definition"]
    if not isinstance(definition, dict) or definition.get("kind") != "prompt":
        raise SystemExit("Expected a Foundry prompt-agent definition.")
    if not document["name"] or not definition.get("model"):
        raise SystemExit("Agent name and model deployment must be non-empty.")
    expected = INSTRUCTIONS.read_text(encoding="utf-8").rstrip()
    if not expected:
        raise SystemExit("Instructions must be non-empty.")
    if args.write:
        definition["instructions"] = expected
    elif definition.get("instructions") != expected:
        raise SystemExit(
            "Instructions differ: run uv run python scripts/sync_foundry_agent.py --write."
        )
    tools = definition.get("tools", [])
    if not isinstance(tools, list) or len(tools) != 2:
        raise SystemExit(
            "Expected one read-only PostgreSQL MCP tool and one Code Interpreter tool."
        )
    if any(not isinstance(tool, dict) for tool in tools):
        raise SystemExit("Tool definitions must be mappings.")
    if sorted(tool.get("type", "") for tool in tools) != ["code_interpreter", "mcp"]:
        raise SystemExit("Only PostgreSQL MCP and Code Interpreter are supported.")
    for tool in tools:
        if tool.get("authorization") or tool.get("headers"):
            raise SystemExit("Reference connection credentials; do not embed tokens or headers.")
        if tool["type"] == "code_interpreter":
            if tool.get("container") != {"type": "auto"}:
                raise SystemExit(
                    "Code Interpreter must use an automatic container without input files."
                )
            continue
        allowed = tool.get("allowed_tools")
        if not isinstance(allowed, list) or set(allowed) != {
            "postgres_table_schema_get",
            "postgres_list",
            "postgres_database_query",
        }:
            raise SystemExit(
                "MCP allowlist must contain only the three reviewed PostgreSQL read tools."
            )
        if not tool.get("project_connection_id") or not tool.get("server_url", "").startswith(
            "https://"
        ):
            raise SystemExit("MCP requires a project connection and an HTTPS endpoint.")
    # Exercise the installed SDK's model conversion; this is not remote schema validation.
    converted = PromptAgentDefinition(definition).as_dict()
    if converted != definition:
        raise SystemExit("The installed Foundry SDK did not preserve the definition on conversion.")
    if args.write:
        output = HEADER + yaml.dump(
            document, Dumper=LiteralDumper, sort_keys=False, allow_unicode=True, width=120
        )
        CONFIG.write_text(output, encoding="utf-8", newline="\n")
    print("Foundry YAML is valid, instructions match, and SDK conversion preserves the definition.")


if __name__ == "__main__":
    main()
