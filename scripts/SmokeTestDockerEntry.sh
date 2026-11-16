#!/usr/bin/env bash
# Bash >=3.2 launcher; the caller owns its shell options and runtime requirements.
# Sourced before smoke fixtures are created or consumer code is executed.
DOCKER_TEST_DIRECTORY=$(dirname -- "$0")
DOCKER_TEST_ROOT=$(cd "$DOCKER_TEST_DIRECTORY/.." && pwd)
if [[ ! -f /.dockerenv ]]; then
  DOCKER_TEST_NAME=$(basename -- "$0")
  exec bash "$DOCKER_TEST_ROOT/scripts/run-in-docker.sh" bash "scripts/$DOCKER_TEST_NAME" "$@"
fi
node "$DOCKER_TEST_ROOT/scripts/RequireDockerTests.ts"
