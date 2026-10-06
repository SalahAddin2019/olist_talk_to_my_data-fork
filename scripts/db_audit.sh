#!/usr/bin/env bash
# Sourced after ROOT is set. Prepare the audit log before any database operation.
LOG="$ROOT/logs/db_operations.md"
mkdir -p "$(dirname "$LOG")"
if [[ ! -f "$LOG" ]]; then
  printf '# Azure PostgreSQL - DB operations log\n\n| # | Timestamp | Database | Action | Detail | Result |\n|---|-----------|----------|--------|--------|--------|\n' > "$LOG"
fi
: >> "$LOG"
n=$(awk -F'|' '/^\| [0-9]+ \|/{gsub(/ /, "", $2); n=$2} END{print n+1}' "$LOG")

log_row() {
  printf '| %s | %s | `%s` | %s | %s | %s |\n' \
    "$n" "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$1" "$2" "$3" "$4" >> "$LOG"
  n=$((n+1))
}
