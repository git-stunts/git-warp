#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
if [[ -f /.dockerenv ]]; then
  exec bash "$ROOT/scripts/run-in-docker.sh" vitest watch "$@"
fi
exec bash "$ROOT/scripts/RunDockerWatch.sh" "$@"
