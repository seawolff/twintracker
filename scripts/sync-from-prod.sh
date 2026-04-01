#!/usr/bin/env bash
# scripts/sync-from-prod.sh
#
# One-way sync: Railway prod PostgreSQL → local Docker PostgreSQL.
# For local testing only. NEVER writes to prod.
#
# Usage:
#   ./scripts/sync-from-prod.sh
#
# Requires RAILWAY_DATABASE_URL to be set — either:
#   a) exported in your shell before running, or
#   b) stored in a .env.prod file at the repo root (already in .gitignore).
#
# .env.prod format:
#   RAILWAY_DATABASE_URL=postgresql://postgres:<password>@<host>:<port>/railway
#
# The Railway DATABASE_URL can be found in:
#   Railway dashboard → your project → PostgreSQL service → Variables tab.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load from .env.prod if the variable isn't already set
if [[ -z "${RAILWAY_DATABASE_URL:-}" ]] && [[ -f "$REPO_ROOT/.env.prod" ]]; then
  # shellcheck source=/dev/null
  source "$REPO_ROOT/.env.prod"
fi

if [[ -z "${RAILWAY_DATABASE_URL:-}" ]]; then
  echo "Error: RAILWAY_DATABASE_URL is not set."
  echo ""
  echo "Options:"
  echo "  1. Create $REPO_ROOT/.env.prod with:"
  echo "       RAILWAY_DATABASE_URL=postgresql://postgres:<pw>@<host>:<port>/railway"
  echo "  2. Or export it before running:"
  echo "       export RAILWAY_DATABASE_URL=postgresql://..."
  exit 1
fi

# Local Docker postgres — override with LOCAL_DATABASE_URL if needed
LOCAL_DB_URL="${LOCAL_DATABASE_URL:-postgres://twintracker:twintracker@localhost:5432/twintracker}"

# Tables in FK-safe insertion order (parents before children)
TABLES=(users babies household_preferences nap_alarms events)

# ── Safety prompt ──────────────────────────────────────────────────────────────

echo ""
echo "  TwinTracker — one-way prod → local sync"
echo ""
echo "  Source : Railway PostgreSQL (read-only)"
echo "  Target : $LOCAL_DB_URL"
echo "  Tables : ${TABLES[*]}"
echo ""
echo "  ⚠  This will OVERWRITE all data in your local database."
echo "  ⚠  It will never touch prod — this script has no write access to Railway."
echo ""
read -r -p "  Continue? [y/N] " CONFIRM
echo ""
[[ "$CONFIRM" == "y" || "$CONFIRM" == "Y" ]] || { echo "  Aborted — nothing changed."; echo ""; exit 0; }

# ── Dump ───────────────────────────────────────────────────────────────────────

DUMP_FILE="$(mktemp /tmp/twintracker-prod-XXXXXX.sql)"
trap 'rm -f "$DUMP_FILE"' EXIT

TABLE_FLAGS=()
for t in "${TABLES[@]}"; do
  TABLE_FLAGS+=("--table=$t")
done

echo "  → Connecting to prod and dumping data..."
# Run pg_dump in a throwaway postgres:18 container so its version matches Railway's server.
# The dump streams to stdout and is captured locally — nothing is written to the container.
docker run --rm postgres:18-alpine pg_dump \
  "$RAILWAY_DATABASE_URL" \
  --data-only \
  --no-privileges \
  --no-owner \
  "${TABLE_FLAGS[@]}" \
  > "$DUMP_FILE"

DUMP_SIZE=$(wc -c < "$DUMP_FILE" | tr -d ' ')
echo "  → Dump complete (${DUMP_SIZE} bytes)"

# ── Restore ────────────────────────────────────────────────────────────────────

echo "  → Clearing local data and restoring prod dump..."

# session_replication_role = replica disables FK trigger checks so we can
# truncate and reload without worrying about insertion order within the dump.
# Strip SET statements unsupported by the local PG 16 (e.g. transaction_timeout added in PG 17+).
# psql runs inside the local Docker db container; stdin is piped from the host.
(
  echo "SET session_replication_role = replica;"
  echo "TRUNCATE TABLE events, nap_alarms, household_preferences, babies, users CASCADE;"
  grep -v "^SET transaction_timeout" "$DUMP_FILE"
  echo "SET session_replication_role = DEFAULT;"
) | docker exec -i twintracker-db-1 psql -U twintracker -d twintracker --single-transaction --quiet

echo "  → Sync complete."
echo ""
echo "  Your local DB now mirrors prod. Happy testing!"
echo ""
