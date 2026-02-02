#!/usr/bin/env bats

setup() {
  PROJECT_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  export PROJECT_ROOT
  export CLI_PATH="${PROJECT_ROOT}/bin/warp-graph.js"
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
  REPO_PATH="${TEST_REPO}" node --input-type=module - <<'EOF'
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';

const projectRoot = process.env.PROJECT_ROOT;
const repoPath = process.env.REPO_PATH;
const moduleUrl = pathToFileURL(resolve(projectRoot, 'index.js')).href;
const { default: WarpGraph, GitGraphAdapter } = await import(moduleUrl);

const runner = ShellRunnerFactory.create();
const plumbing = new GitPlumbing({ cwd: repoPath, runner });
const persistence = new GitGraphAdapter({ plumbing });

const graph = await WarpGraph.open({
  persistence,
  graphName: 'demo',
  writerId: 'alice',
});

const patchOne = await graph.createPatch();
await patchOne
  .addNode('user:alice')
  .setProperty('user:alice', 'role', 'engineering')
  .addNode('user:bob')
  .setProperty('user:bob', 'role', 'engineering')
  .addNode('user:carol')
  .commit();

const patchTwo = await graph.createPatch();
await patchTwo
  .addEdge('user:alice', 'user:bob', 'follows')
  .addEdge('user:bob', 'user:carol', 'follows')
  .commit();
EOF
  cd "${TEST_REPO}"
}

teardown() {
  rm -rf "${TEST_REPO}"
}

assert_success() {
  if [ "$status" -ne 0 ]; then
    echo "$output" >&2
  fi
  [ "$status" -eq 0 ]
}

@test "info reports graphs and writer counts" {
  run "${CLI_PATH}" --repo "${TEST_REPO}" --json info
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
  run "${CLI_PATH}" --repo "${TEST_REPO}" --graph demo --json query \
    --match "user:*" --outgoing follows --select id
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os, sys
data = json.loads(os.environ["JSON"])
assert data["nodes"] == [{"id": "user:bob"}, {"id": "user:carol"}]
PY
}

@test "path finds a shortest path" {
  run "${CLI_PATH}" --repo "${TEST_REPO}" --graph demo --json path \
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
  run "${CLI_PATH}" --repo "${TEST_REPO}" --graph demo --writer alice --json history
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
  run "${CLI_PATH}" --repo "${TEST_REPO}" --graph demo --json check
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os, sys
data = json.loads(os.environ["JSON"])
assert data["graph"] == "demo"
assert "health" in data
assert "gc" in data
assert data["checkpoint"]["ref"].endswith("refs/empty-graph/demo/checkpoints/head")
PY
}
