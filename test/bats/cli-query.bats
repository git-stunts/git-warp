#!/usr/bin/env bats

load helpers/setup.bash

setup() {
  setup_test_repo
  seed_graph "seed-rich.js"
}

teardown() {
  teardown_test_repo
}

@test "query --match returns matching nodes" {
  run git warp --repo "${TEST_REPO}" --graph demo --json query --match "user:*"
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
ids = [n["id"] for n in data["nodes"]]
assert "user:alice" in ids
assert "user:bob" in ids
assert "user:carol" in ids
assert "project:alpha" not in ids
PY
}

@test "query --outgoing traverses edges" {
  run git warp --repo "${TEST_REPO}" --graph demo --json query \
    --match "user:alice" --outgoing manages --select id
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
ids = [n["id"] for n in data["nodes"]]
assert ids == ["user:bob"], f"expected [user:bob], got {ids}"
PY
}

@test "query --incoming traverses reverse edges" {
  run git warp --repo "${TEST_REPO}" --graph demo --json query \
    --match "user:bob" --incoming manages --select id
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
ids = [n["id"] for n in data["nodes"]]
assert ids == ["user:alice"], f"expected [user:alice], got {ids}"
PY
}

@test "query chained --outgoing traversal" {
  run git warp --repo "${TEST_REPO}" --graph demo --json query \
    --match "user:alice" --outgoing manages --outgoing follows --select id
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
ids = [n["id"] for n in data["nodes"]]
assert "user:carol" in ids
PY
}

@test "query --where-prop filters by property" {
  run git warp --repo "${TEST_REPO}" --graph demo --json query \
    --match "user:*" --where-prop role=engineering --select id
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
ids = [n["id"] for n in data["nodes"]]
assert "user:alice" in ids
assert "user:bob" in ids
assert "user:carol" not in ids
PY
}

@test "query --select id returns only IDs" {
  run git warp --repo "${TEST_REPO}" --graph demo --json query \
    --match "dept:*" --select id
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
for n in data["nodes"]:
    assert "id" in n, f"expected 'id' key in node, got {list(n.keys())}"
PY
}

@test "query empty result set" {
  run git warp --repo "${TEST_REPO}" --graph demo --json query \
    --match "nonexistent:*" --select id
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["nodes"] == []
PY
}

@test "query --view ascii produces output" {
  run git warp --repo "${TEST_REPO}" --graph demo --view ascii query --match "user:*"
  assert_success
  [ -n "$output" ]
}
