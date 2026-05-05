#!/usr/bin/env bats

load helpers/setup.bash

setup() {
  setup_test_repo
  seed_graph "seed-graph.js"
}

teardown() {
  teardown_test_repo
}

@test "history returns writer patch chain" {
  run git warp --repo "${TEST_REPO}" --graph demo --writer alice --json history
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["writer"] == "alice"
assert len(data["entries"]) == 2
assert data["entries"][0]["lamport"] == 1
PY
}

@test "history --json includes lamport clocks" {
  run git warp --repo "${TEST_REPO}" --graph demo --writer alice --json history
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
lamports = [e["lamport"] for e in data["entries"]]
assert lamports == [1, 2]
PY
}

@test "history --view ascii is rejected with migration guidance" {
  run git warp --repo "${TEST_REPO}" --graph demo --writer alice --view history
  assert_view_removed
}
