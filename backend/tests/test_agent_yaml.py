"""Offline regression checks for the editable Foundry contract."""

import runpy
from copy import deepcopy
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
SYNC = runpy.run_path(str(ROOT / "scripts/sync_foundry_agent.py"))


def test_duplicated_portal_export_is_rejected():
    with pytest.raises(ValueError, match="Duplicate YAML key"):
        yaml.load("name: olist-agent\nname: olist-agent\n", Loader=SYNC["UniqueKeyLoader"])


@pytest.mark.parametrize("change", ["valid", "missing_code", "write_tool", "credentials", "stale"])
def test_config_contract_and_instruction_consistency(tmp_path, monkeypatch, change):
    document = yaml.safe_load((ROOT / "microsoft_foundry/agent.yaml").read_text(encoding="utf-8"))
    document = deepcopy(document)
    if change == "missing_code":
        document["definition"]["tools"].pop()
    elif change == "write_tool":
        document["definition"]["tools"][0]["allowed_tools"].append("postgres_database_create")
    elif change == "credentials":
        document["definition"]["tools"][0]["headers"] = {"Authorization": "test secret"}
    elif change == "stale":
        document["definition"]["instructions"] = "outdated"
    config = tmp_path / "agent.yaml"
    config.write_text(yaml.safe_dump(document), encoding="utf-8")
    monkeypatch.setitem(SYNC["main"].__globals__, "CONFIG", config)
    monkeypatch.setattr("sys.argv", ["sync_foundry_agent.py"])
    if change == "valid":
        SYNC["main"]()
    else:
        with pytest.raises(SystemExit):
            SYNC["main"]()
