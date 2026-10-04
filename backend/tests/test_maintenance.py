"""Run maintenance scripts against a fake psql, never a database."""

import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
GIT_BASH = Path("C:/Program Files/Git/usr/bin/bash.exe")
BASH = str(GIT_BASH) if os.name == "nt" and GIT_BASH.exists() else shutil.which("bash")
pytestmark = pytest.mark.skipif(not BASH, reason="Bash is required for maintenance checks")


@pytest.fixture
def sandbox(tmp_path):
    scripts = tmp_path / "scripts"
    scripts.mkdir()
    for name in ("db_audit.sh", "reset_olap_abd.sh", "create_abd_databases.sh"):
        shutil.copyfile(ROOT / "scripts" / name, scripts / name)
    (tmp_path / ".env").write_text(
        "PGHOST=example.invalid\nPGPORT=5432\nPGUSER=test\nPGPASSWORD=fake\nPGSSLMODE=require\n"
    )
    (tmp_path / "bin").mkdir()
    stub = tmp_path / "bin/psql"
    stub.write_text('#!/bin/bash\ntouch psql_called\nexit "${PSQL_EXIT:-0}"\n')
    stub.chmod(0o755)
    return tmp_path


def run_script(sandbox, name, exit_code=0):
    return subprocess.run(
        [BASH, "-c", f'PATH="$PWD/bin:/usr/bin:$PATH" "$BASH" scripts/{name}'],
        cwd=sandbox,
        env={**os.environ, "PSQL_EXIT": str(exit_code)},
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )


@pytest.mark.parametrize("name", ["reset_olap_abd.sh", "create_abd_databases.sh"])
def test_unwritable_audit_log_blocks_database_commands(sandbox, name):
    (sandbox / "logs/db_operations.md").mkdir(parents=True)
    result = run_script(sandbox, name)
    assert result.returncode != 0
    assert not (sandbox / "psql_called").exists()


@pytest.mark.parametrize("exit_code, outcome", [(0, "ok"), (7, "failed")])
def test_reset_prepares_log_and_records_outcome(sandbox, exit_code, outcome):
    result = run_script(sandbox, "reset_olap_abd.sh", exit_code)
    assert result.returncode == exit_code, result.stderr
    assert (sandbox / "psql_called").exists()
    log = (sandbox / "logs/db_operations.md").read_text()
    rows = [line for line in log.splitlines() if line.startswith(("| 1 |", "| 2 |"))]
    assert len(rows) == 2
    assert rows[0].endswith("| started |")
    assert rows[1].endswith(f"| {outcome} |")
