#!/usr/bin/env bats

load helpers/setup.bash

setup() {
  setup_test_repo
  seed_graph "seed-doctor-graph.js"
}

teardown() {
  teardown_test_repo
}

# Helper: run a command and capture only stdout (BATS 1.8+ merges stderr into
# $output, which breaks JSON parsing when git emits diagnostic messages).
_run_json() {
  local rc=0
  output=$("$@" 2>/dev/null) || rc=$?
  status=$rc
}

@test "doctor --json healthy graph returns all ok" {
  # Install hooks so the hooks-installed check passes
  run git warp --repo "${TEST_REPO}" install-hooks
  assert_success

  _run_json git warp --repo "${TEST_REPO}" --graph demo --json doctor
  [ "$status" -eq 0 ]

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
  # Install hooks so the hooks-installed check passes
  run git warp --repo "${TEST_REPO}" install-hooks
  assert_success

  run git warp --repo "${TEST_REPO}" --graph demo doctor
  assert_success
  echo "$output" | grep -q "repo-accessible"
  echo "$output" | grep -q "refs-consistent"
  echo "$output" | grep -q "checkpoint-fresh"
  echo "$output" | grep -q "hooks-installed"
}

@test "doctor --json broken writer ref yields refs-consistent fail" {
  # Write a dangling ref directly (git update-ref rejects nonexistent objects)
  mkdir -p "${TEST_REPO}/.git/refs/warp/demo/writers"
  echo "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" > "${TEST_REPO}/.git/refs/warp/demo/writers/ghost"

  _run_json git warp --repo "${TEST_REPO}" --graph demo --json doctor
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
  # Remove the checkpoint ref
  git -C "${TEST_REPO}" update-ref -d refs/warp/demo/checkpoints/head 2>/dev/null || true

  _run_json git warp --repo "${TEST_REPO}" --graph demo --json doctor
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

  _run_json git warp --repo "${TEST_REPO}" --graph demo --json doctor --strict
  [ "$status" -eq 4 ]
}
