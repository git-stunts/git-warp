#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
if [[ -f /.dockerenv ]]; then
  node "$ROOT/scripts/RequireDockerTests.ts"
  export PATH="$ROOT/node_modules/.bin:$PATH"
  exec "$@"
fi

# COPY-based test images never mount the host checkout or its Git directory.
exec docker compose -f "$ROOT/docker/docker-compose.yml" run --build --rm test \
  bash scripts/run-in-docker.sh "$@"
