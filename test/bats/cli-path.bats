#!/usr/bin/env bats

load helpers/setup.bash

setup() {
  setup_test_repo
  seed_graph "seed-graph.js"
}

teardown() {
  teardown_test_repo
}

@test "path finds shortest path" {
  run git warp --repo "${TEST_REPO}" --graph demo --json path \
    user:alice user:carol --dir out --label follows
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["found"] is True
assert data["length"] == 2
assert data["path"] == ["user:alice", "user:bob", "user:carol"]
PY
}

@test "path --dir in finds reverse path" {
  run git warp --repo "${TEST_REPO}" --graph demo --json path \
    user:carol user:alice --dir in --label follows
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["found"] is True
assert data["path"] == ["user:carol", "user:bob", "user:alice"]
PY
}

@test "path not found returns found=false" {
  run git warp --repo "${TEST_REPO}" --graph demo --json path \
    user:carol user:alice --dir out --label follows
  [ "$status" -eq 1 ]

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["found"] is False
PY
}

@test "path --json includes length field" {
  run git warp --repo "${TEST_REPO}" --graph demo --json path \
    user:alice user:bob --dir out --label follows
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["length"] == 1
PY
}

@test "path --view ascii produces output" {
  run git warp --repo "${TEST_REPO}" --graph demo --view path \
    user:alice user:carol --dir out --label follows
  assert_success
  [ -n "$output" ]
}
