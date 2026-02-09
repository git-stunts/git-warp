#!/usr/bin/env bats

load helpers/setup.bash

setup() {
  setup_test_repo
  seed_graph "seed-graph.js"
}

teardown() {
  teardown_test_repo
}

@test "seek --json shows status with no active cursor" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["cursor"]["active"] is False, f"expected cursor.active=False, got {data['cursor']['active']}"
assert len(data["ticks"]) > 0, f"expected ticks array to have entries, got {data['ticks']}"
PY
}

@test "seek --tick 1 --json sets cursor and materializes at tick 1" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick 1
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["cursor"]["active"] is True, f"expected cursor.active=True, got {data['cursor']['active']}"
assert data["cursor"]["tick"] == 1, f"expected tick=1, got {data['cursor']['tick']}"
assert data["state"]["nodes"] == 3, f"expected 3 nodes at tick 1, got {data['state']['nodes']}"
PY
}

@test "seek --tick +1 --json advances to next tick" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick 1
  assert_success

  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick=+1
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["cursor"]["tick"] == 2, f"expected tick=2, got {data['cursor']['tick']}"
PY
}

@test "seek --latest --json clears cursor" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick 1
  assert_success

  run git warp --repo "${TEST_REPO}" --graph demo --json seek --latest
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["cursor"]["active"] is False, f"expected cursor.active=False, got {data['cursor']['active']}"
PY
}

@test "seek --save/--load --json round-trips a cursor" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick 1
  assert_success

  run git warp --repo "${TEST_REPO}" --graph demo --json seek --save bp1
  assert_success

  run git warp --repo "${TEST_REPO}" --graph demo --json seek --latest
  assert_success

  run git warp --repo "${TEST_REPO}" --graph demo --json seek --load bp1
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["cursor"]["active"] is True, f"expected cursor.active=True, got {data['cursor']['active']}"
assert data["cursor"]["tick"] == 1, f"expected tick=1, got {data['cursor']['tick']}"
PY
}

@test "seek --list --json lists saved cursors" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick 1
  assert_success

  run git warp --repo "${TEST_REPO}" --graph demo --json seek --save bp1
  assert_success

  run git warp --repo "${TEST_REPO}" --graph demo --json seek --list
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
names = [c["name"] for c in data["cursors"]]
assert "bp1" in names, f"expected bp1 in saved cursors, got {names}"
PY
}

@test "seek --drop --json deletes saved cursor" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick 1
  assert_success

  run git warp --repo "${TEST_REPO}" --graph demo --json seek --save bp1
  assert_success

  run git warp --repo "${TEST_REPO}" --graph demo --json seek --drop bp1
  assert_success

  run git warp --repo "${TEST_REPO}" --graph demo --json seek --list
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
names = [c["name"] for c in data["cursors"]]
assert "bp1" not in names, f"expected bp1 to be removed, but found it in {names}"
PY
}

@test "seek --tick -1 --json steps backward" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick 2
  assert_success

  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick=-1
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["cursor"]["tick"] == 1, f"expected tick=1, got {data['cursor']['tick']}"
PY
}

@test "query respects active cursor" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick 1
  assert_success

  run git warp --repo "${TEST_REPO}" --graph demo --json query --match '*'
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert len(data["nodes"]) == 3, f"expected 3 nodes at tick 1, got {len(data['nodes'])}"
PY
}

@test "seek plain text output" {
  run git warp --repo "${TEST_REPO}" --graph demo seek
  assert_success
  echo "$output" | grep -q "demo"
}
