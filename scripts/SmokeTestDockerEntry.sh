#!/usr/bin/env bash
# Sourced before smoke fixtures are created or consumer code is executed.
DOCKER_TEST_ROOT=$(cd "$(dirname "$0")/.." && pwd)
if [[ ! -f /.dockerenv ]]; then
  exec bash "$DOCKER_TEST_ROOT/scripts/run-in-docker.sh" bash "scripts/$(basename "$0")" "$@"
fi
node "$DOCKER_TEST_ROOT/scripts/RequireDockerTests.ts"
