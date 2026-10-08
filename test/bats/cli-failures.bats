#!/usr/bin/env bats

load helpers/docker.bash

setup_file() {
  require_docker_tests
}

setup() {
  export TMPDIR="${BATS_TEST_TMPDIR}"
}

@test "installed CLI preserves bounded failure identity, privacy and shutdown diagnostics" {
  cd "${BATS_TEST_DIRNAME}/../.."
  run python3 scripts/check-cli-failures.py
  if [ "$status" -ne 0 ]; then
    printf '%s\n' "$output" >&2
  fi
  [ "$status" -eq 0 ]
}
