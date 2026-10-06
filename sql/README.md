# SQL scripts (Abdullah sandbox)

| File | Database | Purpose |
|------|----------|---------|
| `01_olist_oltp_abd_schema.sql` | `olist_oltp_abd` | OLTP tables — replica of shared `olist_oltp` |
| `02_olist_olap_abd_schema.sql` | `olist_olap_abd` | Empty star — replica of shared `olist_olap` (SERIAL SKs) |

Create DBs + apply DDL + load OLTP data:

```bash
export PGPASSWORD=...   # tgsteam password
./scripts/create_abd_databases.sh
```

Reset only the OLAP rows before rerunning the KNIME workflows:

```bash
./scripts/reset_olap_abd.sh
```

Populate OLAP only through the numbered KNIME workflows. The reset script logs
its sandbox operation in `logs/db_operations.md`. `04_agent_reader_role.sql`
provisions sandbox reader permissions; it must not be applied to shared databases.
