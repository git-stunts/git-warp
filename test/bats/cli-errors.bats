#!/usr/bin/env bats

load helpers/setup.bash

setup() {
  setup_test_repo
  seed_graph "seed-graph.js"
}

teardown() {
  teardown_test_repo
}

@test "invalid repo path produces error" {
  run git warp --repo /nonexistent/path --json info
  assert_failure
}

@test "missing graph name with --graph produces error" {
  run git warp --repo "${TEST_REPO}" --graph nonexistent --json query --match "*"
  assert_failure
}

@test "unknown command produces error" {
  run git warp --repo "${TEST_REPO}" foobar
  assert_failure
}

@test "--view with unsupported command is rejected with migration guidance" {
  run git warp --repo "${TEST_REPO}" --graph demo --view install-hooks
  assert_view_removed
}

@test "path without required args produces error" {
  run git warp --repo "${TEST_REPO}" --graph demo --json path
  assert_failure
}

@test "history without --writer uses default writer" {
  run git warp --repo "${TEST_REPO}" --graph demo --json history
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["writer"] == "cli"
assert data["entries"] == []
PY
}
