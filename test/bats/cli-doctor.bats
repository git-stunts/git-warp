#!/usr/bin/env bats

load helpers/setup.bash

setup() {
  setup_test_repo
  seed_graph "seed-graph.js"
}

teardown() {
  teardown_test_repo
}

@test "doctor --json healthy graph returns all ok" {
  run git warp --repo "${TEST_REPO}" --graph demo --json doctor
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["doctorVersion"] == 1
assert data["graph"] == "demo"
assert data["health"] == "ok"
assert data["summary"]["checksRun"] == 7
assert data["summary"]["fail"] == 0
assert data["summary"]["ok"] >= 1
assert isinstance(data["findings"], list)
assert len(data["findings"]) >= 7
assert isinstance(data["policy"], dict)
assert data["policy"]["clockSkewMs"] == 300000
PY
}

@test "doctor human output includes check IDs" {
  run git warp --repo "${TEST_REPO}" --graph demo doctor
  assert_success
  echo "$output" | grep -q "repo-accessible"
  echo "$output" | grep -q "refs-consistent"
  echo "$output" | grep -q "checkpoint-fresh"
  echo "$output" | grep -q "hooks-installed"
}

@test "doctor --json broken writer ref yields refs-consistent fail" {
  # Point writer ref to a non-existent object
  git -C "${TEST_REPO}" update-ref refs/warp/demo/writers/ghost deadbeefdeadbeefdeadbeefdeadbeefdeadbeef

  run git warp --repo "${TEST_REPO}" --graph demo --json doctor
  # Should exit with code 3 (findings)
  [ "$status" -eq 3 ]

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["health"] == "failed"
codes = [f["code"] for f in data["findings"]]
assert "REFS_DANGLING_OBJECT" in codes
PY
}

@test "doctor --json no checkpoint yields checkpoint-fresh warn" {
  # Remove the checkpoint ref if it exists
  git -C "${TEST_REPO}" update-ref -d refs/warp/demo/checkpoints/head 2>/dev/null || true

  run git warp --repo "${TEST_REPO}" --graph demo --json doctor
  # exit 3 = findings present
  [ "$status" -eq 3 ]

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
codes = [f["code"] for f in data["findings"]]
assert "CHECKPOINT_MISSING" in codes
PY
}

@test "doctor --strict with warnings returns exit 4" {
  # Remove checkpoint to trigger a warning
  git -C "${TEST_REPO}" update-ref -d refs/warp/demo/checkpoints/head 2>/dev/null || true

  run git warp --repo "${TEST_REPO}" --graph demo --json doctor --strict
  [ "$status" -eq 4 ]
}
