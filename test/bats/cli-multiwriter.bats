#!/usr/bin/env bats

load helpers/setup.bash

setup() {
  setup_test_repo
  seed_graph "seed-multiwriter.js"
}

teardown() {
  teardown_test_repo
}

@test "query merged result sees all writers' nodes" {
  run git warp --repo "${TEST_REPO}" --graph demo --json query --match "user:*" --select id
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
ids = [n["id"] for n in data["nodes"]]
assert "user:alice" in ids
assert "user:bob" in ids
assert "user:charlie" in ids
PY
}

@test "info shows correct writer count" {
  run git warp --repo "${TEST_REPO}" --json info
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
g = data["graphs"][0]
assert g["writers"]["count"] == 3, f"expected 3 writers, got {g['writers']['count']}"
PY
}

@test "history per writer shows correct patches" {
  run git warp --repo "${TEST_REPO}" --graph demo --writer alice --json history
  assert_success
  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["writer"] == "alice"
assert len(data["entries"]) == 2
PY

  run git warp --repo "${TEST_REPO}" --graph demo --writer bob --json history
  assert_success
  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["writer"] == "bob"
assert len(data["entries"]) == 2
PY

  run git warp --repo "${TEST_REPO}" --graph demo --writer charlie --json history
  assert_success
  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["writer"] == "charlie"
assert len(data["entries"]) == 1
PY
}

@test "check shows all writers in frontier" {
  run git warp --repo "${TEST_REPO}" --graph demo --json check
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
frontier = data["status"]["frontier"]
assert "alice" in frontier
assert "bob" in frontier
assert "charlie" in frontier
PY
}

@test "materialize merges all writers" {
  run git warp --repo "${TEST_REPO}" --graph demo --json materialize
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
r = data["graphs"][0]
# 3 users + 1 project = 4 nodes
assert r["nodes"] == 4, f"expected 4 nodes, got {r['nodes']}"
# alice->project:alpha (owns) + bob->project:alpha (contributes) = 2 edges
assert r["edges"] == 2, f"expected 2 edges, got {r['edges']}"
PY
}
