#!/usr/bin/env bash
# Empty the OLAP sandbox before rerunning the KNIME pipelines.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a

# shellcheck source=db_audit.sh
source "$ROOT/scripts/db_audit.sh"
log_row olist_olap_abd TRUNCATE "all OLAP tables, restart identities" started
trap 'log_row olist_olap_abd TRUNCATE "all OLAP tables, restart identities" failed' ERR

psql -d olist_olap_abd -v ON_ERROR_STOP=1 <<'SQL'
TRUNCATE TABLE
  fact_order_item,
  dim_seller,
  dim_customer,
  dim_product,
  dim_category,
  dim_geography,
  dim_date,
  dq_report
RESTART IDENTITY;
SQL

log_row olist_olap_abd TRUNCATE "all OLAP tables, restart identities" ok

echo "OLAP sandbox reset complete"
