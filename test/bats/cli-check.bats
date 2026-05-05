#!/usr/bin/env bats

load helpers/setup.bash

setup() {
  setup_test_repo
  seed_graph "seed-graph.js"
}

teardown() {
  teardown_test_repo
}

@test "check --json includes health and gc fields" {
  run git warp --repo "${TEST_REPO}" --graph demo --json check
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["graph"] == "demo"
assert "health" in data
assert "gc" in data
PY
}

@test "check --json includes status fields" {
  run git warp --repo "${TEST_REPO}" --graph demo --json check
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
status = data["status"]
assert status["cachedState"] in ("fresh", "stale", "none")
assert isinstance(status["patchesSinceCheckpoint"], int)
assert isinstance(status["tombstoneRatio"], (int, float))
assert isinstance(status["writers"], int)
assert status["writers"] >= 1
assert isinstance(status["frontier"], dict)
assert "alice" in status["frontier"]
PY
}

@test "check --json checkpoint ref" {
  run git warp --repo "${TEST_REPO}" --graph demo --json check
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["checkpoint"]["ref"].endswith("refs/warp/demo/checkpoints/head")
PY
}

@test "check default output includes status fields" {
  run git warp --repo "${TEST_REPO}" --graph demo check
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
status = data["status"]
assert "cachedState" in status
assert "patchesSinceCheckpoint" in status
assert "tombstoneRatio" in status
PY
}

@test "check --view ascii is rejected with migration guidance" {
  run git warp --repo "${TEST_REPO}" --graph demo --view ascii check
  assert_view_removed
}
