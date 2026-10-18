#!/usr/bin/env bash
# Esegue i test del database su un PostgreSQL temporaneo locale (serve PostgreSQL 15 o successivo).
set -euo pipefail
export LC_ALL=C LANG=C

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"

if command -v pg_ctl >/dev/null 2>&1; then
  pg_bin="$(dirname "$(command -v pg_ctl)")"
else
  pg_bin="$(ls -d /opt/homebrew/opt/postgresql@*/bin /usr/local/opt/postgresql@*/bin /usr/lib/postgresql/*/bin 2>/dev/null | tail -1 || true)"
fi
if [ -z "${pg_bin:-}" ] || [ ! -x "$pg_bin/pg_ctl" ]; then
  echo "PostgreSQL non trovato: installalo (es. brew install postgresql@16) o imposta PATH" >&2
  exit 1
fi

port="${PG_TEST_PORT:-54329}"
tmp="$(mktemp -d)"
cleanup() {
  "$pg_bin/pg_ctl" -D "$tmp/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

"$pg_bin/initdb" -D "$tmp/data" -U postgres -A trust --locale=C >/dev/null
if ! "$pg_bin/pg_ctl" -D "$tmp/data" -o "-p $port -k '' -c listen_addresses=127.0.0.1" -l "$tmp/log" start >/dev/null; then
  cat "$tmp/log" >&2
  exit 1
fi

run_psql() {
  "$pg_bin/psql" -h 127.0.0.1 -p "$port" -U postgres -X -q -v ON_ERROR_STOP=1 "$@"
}

for _ in $(seq 1 50); do
  run_psql -c 'select 1' >/dev/null 2>&1 && break
  sleep 0.2
done

run_psql -f "$here/supabase-stub.sql" >/dev/null 2>&1
run_psql -f "$root/supabase/schema.sql" >/dev/null 2>&1
run_psql -f "$root/supabase/schema.sql" >/dev/null 2>&1
echo "ok - lo schema si installa e si può rieseguire"
run_psql -f "$here/schema.test.sql"
