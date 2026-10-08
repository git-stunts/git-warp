#!/usr/bin/env bats

load helpers/docker.bash

setup_file() {
  require_docker_tests
}

setup() {
  export TMPDIR="${BATS_TEST_TMPDIR}"
}

assert_driver_success() {
  if [ "$status" -ne 0 ]; then
    printf '%s\n' "$output" >&2
  fi
  [ "$status" -eq 0 ]
}

@test "installed CLI uses one Node process with stable command statuses" {
  cd "${BATS_TEST_DIRNAME}/../.."
  run python3 scripts/check-cli-process.py
  assert_driver_success
}

@test "launcher preserves entry boundaries, streams, signals and full native coverage" {
  cd "${BATS_TEST_DIRNAME}/../.."
  run python3 scripts/check-cli-launcher.py
  assert_driver_success
}
