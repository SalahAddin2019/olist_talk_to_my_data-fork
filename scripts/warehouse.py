"""Read-only, audited access to olist_olap_abd for the scripts in this folder.

Connection settings come from the standard libpq variables (PGHOST, PGUSER, PGPASSWORD,
PGSSLMODE, ...), loaded from the repository's .env when present. Every query runs in a
read-only transaction with statement and lock timeouts and is recorded in
logs/db_operations.md without credentials, parameters or result rows.
"""

import hashlib
import json
import os
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[1]
DATABASE = "olist_olap_abd"
AUDIT_LOG = ROOT / "logs/db_operations.md"


def audit(operation: str, sql: str, **details):
    event = {
        "timestamp": datetime.now(UTC).isoformat(),
        "database": DATABASE,
        "operation": operation,
        "request_id": uuid4().hex,
        "query_hash": hashlib.sha256(sql.encode()).hexdigest()[:16],
        **details,
    }
    # Fail closed: the query does not run if its audit entry cannot be written.
    AUDIT_LOG.parent.mkdir(parents=True, exist_ok=True)
    with AUDIT_LOG.open("a", encoding="utf-8") as file:
        file.write("\n- Script DB audit: `" + json.dumps(event) + "`\n")


def serialize(row: dict) -> dict:
    return {
        key: str(value)
        if isinstance(value, Decimal)
        else value.isoformat()
        if isinstance(value, (date, datetime))
        else value
        for key, value in row.items()
    }


class Warehouse:
    def __init__(self, timeout_ms: int = 30_000):
        load_dotenv(ROOT / ".env", override=False)
        os.environ.setdefault("PGDATABASE", DATABASE)
        if os.environ["PGDATABASE"] != DATABASE:
            raise SystemExit(f"These scripts only read {DATABASE}.")
        self.timeout_ms = timeout_ms
        self.connection = psycopg.connect(
            application_name="olist_warehouse_scripts", autocommit=True, row_factory=dict_row
        )

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.connection.close()

    def read(self, sql: str, operation: str) -> list[dict]:
        audit(operation + ".started", sql)
        try:
            with self.connection.transaction():
                self.connection.execute("SET TRANSACTION READ ONLY")
                self.connection.execute(
                    "SELECT set_config('statement_timeout', %s, true)", (str(self.timeout_ms),)
                )
                self.connection.execute("SELECT set_config('lock_timeout', '2000', true)")
                rows = self.connection.execute(sql).fetchall()
        except Exception as exc:
            audit(operation + ".failed", sql, error_type=type(exc).__name__)
            raise
        audit(operation + ".completed", sql, rows=len(rows))
        return [serialize(row) for row in rows]
