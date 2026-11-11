#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
mkdir -p "$repo_root/.local/phase2"
{
  "$repo_root/scripts/local-postgres.sh" start
  cd "$repo_root/server"
  npm run db:migrate
  npm run db:seed
} 2>&1 | tee "$repo_root/.local/phase2/database-setup.log"
