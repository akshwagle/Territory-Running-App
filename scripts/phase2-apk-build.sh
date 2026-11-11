#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
mkdir -p "$repo_root/.local/phase2"
cd "$repo_root/mobile"
npm run apk:debug 2>&1 | tee "$repo_root/.local/phase2/apk-build.log"
