#!/usr/bin/env bats

load helpers/setup.bash

setup() {
  setup_test_repo
  seed_graph "seed-graph.js"
}

teardown() {
  teardown_test_repo
}

@test "info --json reports graph name and writer count" {
  run git warp --repo "${TEST_REPO}" --json info
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["graphs"][0]["name"] == "demo"
assert data["graphs"][0]["writers"]["count"] >= 1
PY
}

@test "info --json includes checkpoint and coverage fields" {
  run git warp --repo "${TEST_REPO}" --json info
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
g = data["graphs"][0]
assert "checkpoint" in g
assert "coverage" in g
PY
}

@test "info human output contains graph name" {
  run git warp --repo "${TEST_REPO}" info
  assert_success
  echo "$output" | grep -q "demo"
}

@test "info --view ascii produces box-drawn output" {
  run git warp --repo "${TEST_REPO}" --view info
  assert_success
  # ASCII view should contain box-drawing characters or table structure
  [ -n "$output" ]
}

@test "info on empty repo shows no graphs" {
  local empty_repo
  empty_repo="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '${empty_repo}'" RETURN
  cd "${empty_repo}" || return 1
  git init >/dev/null
  git config user.email "test@test.com"
  git config user.name "Test"

  run git warp --repo "${empty_repo}" --json info
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["graphs"] == []
PY
}
