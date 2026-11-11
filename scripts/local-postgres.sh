#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
local_dir="$repo_root/.local"
pg_bin="$local_dir/postgres16/bin"
pg_data="$local_dir/pgdata"
pg_log="$local_dir/postgres.log"
pg_socket="$local_dir/run"
pg_port="${LOCAL_POSTGRES_PORT:-55432}"

usage() { printf 'Usage: %s {start|stop|status}\n' "$0" >&2; }
if [[ $# -ne 1 ]]; then usage; exit 2; fi
case "$1" in start|stop|status) ;; *) usage; exit 2 ;; esac
if [[ ! "$pg_port" =~ ^[0-9]+$ ]] || (( 10#$pg_port < 1024 || 10#$pg_port > 65535 )); then
  printf 'LOCAL_POSTGRES_PORT must be an integer from 1024 to 65535.\n' >&2
  exit 2
fi
if [[ ! -x "$pg_bin/postgres" || ! -x "$pg_bin/pg_ctl" || ! -x "$pg_bin/pg_isready" ]]; then
  printf 'Install PostgreSQL 16 in %s/postgres16 first; see README.md.\n' "$local_dir" >&2
  exit 1
fi
if [[ ! -f "$pg_data/PG_VERSION" || "$(cat "$pg_data/PG_VERSION")" != 16 ]]; then
  printf 'Expected an initialized PostgreSQL 16 cluster in %s; see README.md.\n' "$pg_data" >&2
  exit 1
fi

# A source-built macOS client can retain its original absolute libpq path.
# Resolve bundled libraries from the relocated installation for every command.
export DYLD_LIBRARY_PATH="$local_dir/postgres16/lib${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
export LD_LIBRARY_PATH="$local_dir/postgres16/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
if [[ "$("$pg_bin/postgres" --version)" != *" 16."* ]]; then
  printf 'The local installation must be PostgreSQL 16.\n' >&2
  exit 1
fi

case "$1" in
  start)
    if "$pg_bin/pg_ctl" -D "$pg_data" status >/dev/null 2>&1; then
      printf 'Local PostgreSQL is already running.\n'
      exit 0
    fi
    # Do not start another instance when process inspection is sandboxed, or
    # when the requested port belongs to another server.
    if "$pg_bin/pg_isready" -h 127.0.0.1 -p "$pg_port" -t 2 >/dev/null 2>&1; then
      printf 'Port %s already accepts PostgreSQL connections; inspect the running server before starting.\n' "$pg_port" >&2
      exit 1
    fi
    mkdir -p "$pg_socket"
    chmod 700 "$pg_socket"
    if (( ${#pg_socket} > 80 )); then
      printf 'Repository path is too long for the local Unix socket; use a shorter checkout path.\n' >&2
      exit 1
    fi
    # This process writes logs only under .local and listens only on loopback.
    "$pg_bin/pg_ctl" -D "$pg_data" -l "$pg_log" -w -t 30 \
      -o "-h 127.0.0.1 -p $pg_port -k \"$pg_socket\"" start
    "$pg_bin/pg_isready" -h 127.0.0.1 -p "$pg_port" -t 5
    ;;
  stop)
    # pg_ctl handles a stopped cluster; never remove PID files or send a
    # forced kill. Fast shutdown rolls back open work and checkpoints cleanly.
    "$pg_bin/pg_ctl" -D "$pg_data" -m fast -w -t 30 stop
    ;;
  status)
    "$pg_bin/pg_ctl" -D "$pg_data" status
    "$pg_bin/pg_isready" -h 127.0.0.1 -p "$pg_port" -t 5
    ;;
esac
