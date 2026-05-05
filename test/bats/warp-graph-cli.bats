#!/usr/bin/env bats

setup() {
  _BATS_T0=$(date +%s)
  echo "STARTING TEST: ${BATS_TEST_DESCRIPTION}" >&3
  PROJECT_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  export PROJECT_ROOT
  export TEST_REPO
  TEST_REPO="$(mktemp -d)"
  cd "${TEST_REPO}"

  git init >/dev/null
  git config user.email "test@test.com"
  git config user.name "Test"
  export GIT_AUTHOR_NAME="Test"
  export GIT_AUTHOR_EMAIL="test@test.com"
  export GIT_COMMITTER_NAME="Test"
  export GIT_COMMITTER_EMAIL="test@test.com"

  cd "${PROJECT_ROOT}"
  NODE_NO_WARNINGS=1 REPO_PATH="${TEST_REPO}" node --experimental-transform-types -e '
    import("node:url")
      .then(({ pathToFileURL }) => import(pathToFileURL(process.argv[1]).href))
      .then(
        () => process.exit(0),
        (error) => {
          console.error(error);
          process.exit(1);
        },
      );
  ' "${PROJECT_ROOT}/test/bats/helpers/seed-graph.ts"
  cd "${TEST_REPO}"
}

teardown() {
  rm -rf "${TEST_REPO}"
  local elapsed=$(( $(date +%s) - _BATS_T0 ))
  echo "ENDED TEST: ${BATS_TEST_DESCRIPTION} took ${elapsed}s" >&3
}

assert_success() {
  if [ "$status" -ne 0 ]; then
    echo "$output" >&2
  fi
  [ "$status" -eq 0 ]
}

@test "info reports graphs and writer counts" {
  run git warp --repo "${TEST_REPO}" --json info
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os, sys
data = json.loads(os.environ["JSON"])
assert data["graphs"][0]["name"] == "demo"
assert data["graphs"][0]["writers"]["count"] == 1
assert "checkpoint" in data["graphs"][0]
assert "coverage" in data["graphs"][0]
PY
}

@test "query returns nodes using builder" {
  run git warp --repo "${TEST_REPO}" --graph demo --json query \
    --match "user:*" --outgoing follows --select id
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os, sys
data = json.loads(os.environ["JSON"])
ids = sorted(n["id"] for n in data["nodes"])
assert ids == ["user:bob", "user:carol"], f"Expected [user:bob, user:carol] but got {ids}"
PY
}

@test "path finds a shortest path" {
  run git warp --repo "${TEST_REPO}" --graph demo --json path \
    user:alice user:carol --dir out --label follows
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os, sys
data = json.loads(os.environ["JSON"])
assert data["found"] is True
assert data["length"] == 2
assert data["path"] == ["user:alice", "user:bob", "user:carol"]
PY
}

@test "history returns writer patch chain" {
  run git warp --repo "${TEST_REPO}" --graph demo --writer alice --json history
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os, sys
data = json.loads(os.environ["JSON"])
assert data["writer"] == "alice"
assert len(data["entries"]) == 2
assert data["entries"][0]["lamport"] == 1
PY
}

@test "check returns health and GC info" {
  run git warp --repo "${TEST_REPO}" --graph demo --json check
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os, sys
data = json.loads(os.environ["JSON"])
assert data["graph"] == "demo"
assert "health" in data
assert "gc" in data
assert data["checkpoint"]["ref"].endswith("refs/warp/demo/checkpoints/head")
PY
}

@test "check --json includes status fields from graph.status()" {
  run git warp --repo "${TEST_REPO}" --graph demo --json check
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os, sys
data = json.loads(os.environ["JSON"])
status = data["status"]
assert status["cachedState"] in ("fresh", "stale", "none"), f"unexpected cachedState: {status['cachedState']}"
assert isinstance(status["patchesSinceCheckpoint"], int)
assert isinstance(status["tombstoneRatio"], (int, float))
assert isinstance(status["writers"], int)
assert status["writers"] >= 1
assert isinstance(status["frontier"], dict)
assert "alice" in status["frontier"]
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

@test "--view with unsupported command produces error" {
  run git warp --repo "${TEST_REPO}" --graph demo --view install-hooks
  [ "$status" -eq 1 ]
  echo "$output" | grep -q -- "--view has been removed"
  echo "$output" | grep -q "warp-ttd"
}
