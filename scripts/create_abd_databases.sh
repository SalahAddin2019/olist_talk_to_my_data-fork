#!/usr/bin/env bash
# Create olist_oltp_abd + olist_olap_abd, apply schema DDL, load OLTP from shared olist_oltp.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a
: "${PGHOST:?Set PGHOST in .env}" "${PGPORT:?Set PGPORT in .env}"
: "${PGUSER:?Set PGUSER in .env}" "${PGPASSWORD:?Set PGPASSWORD in .env}"
: "${PGSSLMODE:?Set PGSSLMODE in .env}"

# shellcheck source=db_audit.sh
source "$ROOT/scripts/db_audit.sh"
log_row postgres PROVISION "create_abd_databases.sh" started
trap 'log_row postgres PROVISION "create_abd_databases.sh" failed' ERR

psql_admin() { psql -d postgres -v ON_ERROR_STOP=1 "$@"; }
psql_db() { local db="$1"; shift; psql -d "$db" -v ON_ERROR_STOP=1 "$@"; }

psql_admin -c "SELECT current_user;" >/dev/null
log_row postgres "CONNECT" "create_abd_databases.sh as $PGUSER" "ok"

# Drop prior personal sandbox databases.
for db in olist_oltp_abd olist_olap_abd; do
  psql_admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$db' AND pid<>pg_backend_pid();" >/dev/null || true
  psql_admin -c "DROP DATABASE IF EXISTS $db;"
  log_row postgres "DROP DATABASE" "IF EXISTS $db" "ok"
done

for db in olist_oltp_abd olist_olap_abd; do
  psql_admin -c "CREATE DATABASE $db OWNER $PGUSER;"
  log_row postgres "CREATE DATABASE" "$db OWNER $PGUSER" "ok"
done

psql_db olist_oltp_abd -f "$ROOT/sql/01_olist_oltp_abd_schema.sql"
log_row olist_oltp_abd "DDL" "01_olist_oltp_abd_schema.sql — 9 OLTP tables" "ok"

psql_db olist_olap_abd -f "$ROOT/sql/02_olist_olap_abd_schema.sql"
log_row olist_olap_abd "DDL" "02_olist_olap_abd_schema.sql — empty star" "ok"

declare -a TABLES=(
  product_category_name_translation
  customers
  geolocation
  products
  sellers
  orders
  order_items
  order_payments
  order_reviews
)

for table in "${TABLES[@]}"; do
  psql -d olist_oltp -c "\\copy $table TO STDOUT WITH (FORMAT csv, HEADER true)" \
    | psql_db olist_oltp_abd -c "\\copy $table FROM STDIN WITH (FORMAT csv, HEADER true)"
  rows=$(psql_db olist_oltp_abd -tAc "SELECT COUNT(*) FROM $table")
  log_row olist_oltp_abd "COPY" "$table ← olist_oltp (csv pipe)" "ok: $rows rows"
done

echo "=== olist_oltp_abd counts ==="
psql_db olist_oltp_abd -c "
SELECT 'customers' t, COUNT(*) c FROM customers
UNION ALL SELECT 'geolocation', COUNT(*) FROM geolocation
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'sellers', COUNT(*) FROM sellers
UNION ALL SELECT 'orders', COUNT(*) FROM orders
UNION ALL SELECT 'order_items', COUNT(*) FROM order_items
UNION ALL SELECT 'order_payments', COUNT(*) FROM order_payments
UNION ALL SELECT 'order_reviews', COUNT(*) FROM order_reviews
UNION ALL SELECT 'product_category_name_translation', COUNT(*) FROM product_category_name_translation
ORDER BY 1;"
log_row olist_oltp_abd "SELECT" "final OLTP row counts" "ok"

echo "=== olist_olap_abd empty check ==="
psql_db olist_olap_abd -c "
SELECT 'dim_date' t, COUNT(*) c FROM dim_date
UNION ALL SELECT 'dim_geography', COUNT(*) FROM dim_geography
UNION ALL SELECT 'dim_category', COUNT(*) FROM dim_category
UNION ALL SELECT 'dim_product', COUNT(*) FROM dim_product
UNION ALL SELECT 'dim_customer', COUNT(*) FROM dim_customer
UNION ALL SELECT 'dim_seller', COUNT(*) FROM dim_seller
UNION ALL SELECT 'fact_order_item', COUNT(*) FROM fact_order_item
ORDER BY 1;"
log_row olist_olap_abd "SELECT" "confirm empty OLAP star" "ok: all 0"

echo "DONE"
