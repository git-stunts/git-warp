#!/usr/bin/env bats

load helpers/setup.bash

setup() {
  setup_test_repo
  seed_graph "seed-audit-graph.js"
}

teardown() {
  teardown_test_repo
}

@test "verify-audit --json returns VALID for clean chain" {
  run git warp --repo "${TEST_REPO}" --graph demo --json verify-audit
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["graph"] == "demo"
assert data["summary"]["total"] == 1
assert data["summary"]["valid"] == 1
assert data["summary"]["invalid"] == 0
chain = data["chains"][0]
assert chain["writerId"] == "alice"
assert chain["status"] == "VALID"
assert chain["receiptsVerified"] == 3
assert len(chain["errors"]) == 0
PY
}

@test "verify-audit human output includes status" {
  run git warp --repo "${TEST_REPO}" --graph demo verify-audit
  assert_success
  echo "$output" | grep -q "Writer: alice"
  echo "$output" | grep -q "VALID"
  echo "$output" | grep -q "Receipts:"
}

@test "verify-audit --writer alice selects single chain" {
  run git warp --repo "${TEST_REPO}" --graph demo --json verify-audit --writer alice
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["summary"]["total"] == 1
assert data["chains"][0]["writerId"] == "alice"
assert data["chains"][0]["status"] == "VALID"
PY
}

@test "verify-audit --since partial verification" {
  # Get the second audit commit (tick 2)
  AUDIT_REF=$(git --git-dir="${TEST_REPO}/.git" for-each-ref --format='%(objectname)' refs/warp/demo/audit/alice)
  # Walk back one step to get the parent (tick 2)
  PARENT=$(git --git-dir="${TEST_REPO}/.git" rev-parse "${AUDIT_REF}^")

  run git warp --repo "${TEST_REPO}" --graph demo --json verify-audit --since "${PARENT}"
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
chain = data["chains"][0]
assert chain["status"] == "PARTIAL"
assert chain["receiptsVerified"] == 2  # tip + parent
PY
}

@test "verify-audit detects tampered Git parent" {
  AUDIT_REF="refs/warp/demo/audit/alice"
  TIP=$(git --git-dir="${TEST_REPO}/.git" rev-parse "${AUDIT_REF}")

  # Create a dangling commit with wrong parent to break the chain
  TREE=$(git --git-dir="${TEST_REPO}/.git" rev-parse "${TIP}^{tree}")
  MSG=$(git --git-dir="${TEST_REPO}/.git" show -s --format=%B "${TIP}")
  # Create a new commit with the same tree+message but no parent
  FAKE=$(echo "${MSG}" | git --git-dir="${TEST_REPO}/.git" commit-tree "${TREE}")
  # Point the audit ref to this orphan commit
  git --git-dir="${TEST_REPO}/.git" update-ref "${AUDIT_REF}" "${FAKE}"

  run git warp --repo "${TEST_REPO}" --graph demo --json verify-audit
  [ "$status" -eq 3 ]

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
chain = data["chains"][0]
assert chain["status"] in ("BROKEN_CHAIN", "DATA_MISMATCH", "ERROR"), chain["status"]
assert len(chain["errors"]) > 0
PY
}

@test "verify-audit succeeds with no audit refs" {
  # Seed a non-audit graph
  rm -rf "${TEST_REPO}"
  TEST_REPO="$(mktemp -d)"
  cd "${TEST_REPO}" || return 1
  git init >/dev/null
  git config user.email "test@test.com"
  git config user.name "Test"
  export GIT_AUTHOR_NAME="Test"
  export GIT_AUTHOR_EMAIL="test@test.com"
  export GIT_COMMITTER_NAME="Test"
  export GIT_COMMITTER_EMAIL="test@test.com"
  seed_graph "seed-graph.js"

  run git warp --repo "${TEST_REPO}" --graph demo --json verify-audit
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["summary"]["total"] == 0
assert data["summary"]["valid"] == 0
PY
}
