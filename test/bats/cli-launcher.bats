#!/usr/bin/env bats

load helpers/docker.bash

setup_file() {
  require_docker_tests
}

@test "installed CLI uses one Node process with stable command statuses" {
  cd "${BATS_TEST_DIRNAME}/../.."
  run python3 scripts/check-cli-process.py
  [ "$status" -eq 0 ]
}

@test "launcher preserves entry boundaries, streams, signals and full native coverage" {
  cd "${BATS_TEST_DIRNAME}/../.."
  run python3 scripts/check-cli-launcher.py
  [ "$status" -eq 0 ]
}
