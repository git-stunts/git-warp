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
assert all(isinstance(t, int) for t in data["ticks"]), f"expected all ticks to be integers, got {data['ticks']}"
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
assert data["nodes"] == 3, f"expected 3 nodes at tick 1, got {data['nodes']}"
assert data["edges"] == 0, f"expected 0 edges at tick 1, got {data['edges']}"
assert data["patchCount"] == 1, f"expected 1 patch at tick 1, got {data['patchCount']}"
assert data["diff"] is None, f"expected diff=null at first seek, got {data['diff']}"

receipt = data.get("tickReceipt")
assert isinstance(receipt, dict), f"expected tickReceipt object, got {receipt}"
assert "alice" in receipt, f"expected tickReceipt to include alice, got keys={list(receipt.keys())}"

entry = receipt["alice"]
sha = entry.get("sha")
assert isinstance(sha, str) and len(sha) == 40, f"expected 40-char sha, got {sha}"
assert all(c in "0123456789abcdef" for c in sha), f"expected sha to be hex, got {sha}"

summary = entry.get("opSummary") or {}
assert summary.get("NodeAdd") == 3, f"expected NodeAdd=3, got {summary.get('NodeAdd')}"
assert summary.get("PropSet") == 3, f"expected PropSet=3, got {summary.get('PropSet')}"
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

@test "seek --tick=+1 --json includes diff + tickReceipt with sha" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick 1
  assert_success

  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick=+1
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["tick"] == 2, f"expected tick=2, got {data['tick']}"
assert data["nodes"] == 3, f"expected 3 nodes at tick 2, got {data['nodes']}"
assert data["edges"] == 2, f"expected 2 edges at tick 2, got {data['edges']}"
assert data["patchCount"] == 2, f"expected 2 patches at tick 2, got {data['patchCount']}"

diff = data.get("diff")
assert isinstance(diff, dict), f"expected diff object, got {diff}"
assert diff.get("nodes") == 0, f"expected nodes diff=0, got {diff.get('nodes')}"
assert diff.get("edges") == 2, f"expected edges diff=2, got {diff.get('edges')}"

receipt = data.get("tickReceipt") or {}
assert "alice" in receipt, f"expected tickReceipt to include alice, got keys={list(receipt.keys())}"
entry = receipt["alice"]
sha = entry.get("sha")
assert isinstance(sha, str) and len(sha) == 40, f"expected 40-char sha, got {sha}"
summary = entry.get("opSummary") or {}
assert summary.get("EdgeAdd") == 2, f"expected EdgeAdd=2, got {summary.get('EdgeAdd')}"
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

  # Capture query output to a file to avoid BATS $output edge cases
  local qfile="${TEST_REPO}/query_out.json"
  git warp --repo "${TEST_REPO}" --graph demo --json query --match '*' > "${qfile}"
  python3 -c "
import json
data = json.load(open('${qfile}'))
assert len(data['nodes']) == 3, f'expected 3 nodes at tick 1, got {len(data[\"nodes\"])}'
"
}

@test "query returns full node set after --latest clears cursor" {
  # Seek to tick 0 (empty state), then clear with --latest.
  # Query must return the full 3-node graph, proving cursor was cleared.
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick 0
  assert_success

  run git warp --repo "${TEST_REPO}" --graph demo --json seek --latest
  assert_success

  run git warp --repo "${TEST_REPO}" --graph demo --json query --match '*'
  assert_success

  echo "$output" | python3 -c "
import json, sys
data = json.load(sys.stdin)
assert len(data['nodes']) == 3, f'expected 3 nodes after latest, got {len(data[\"nodes\"])}'
"
}

@test "seek plain text output" {
  run git warp --repo "${TEST_REPO}" --graph demo seek
  assert_success
  echo "$output" | grep -q "demo"
  echo "$output" | grep -qiE "tick|cursor"
}

@test "seek plain text output includes receipt summary with sha" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick 1
  assert_success

  short_sha="$(JSON="$output" python3 -c 'import json, os; j = json.loads(os.environ["JSON"]); print(j["tickReceipt"]["alice"]["sha"][:7])')"

  run git warp --repo "${TEST_REPO}" --graph demo seek --tick 1
  assert_success

  echo "$output" | grep -q "Tick 1:"
  echo "$output" | grep -q "alice"
  echo "$output" | grep -q "${short_sha}"
  echo "$output" | grep -q "\\+3node"
  echo "$output" | grep -q "~3prop"
}

@test "seek --json suppresses diff when frontier changes" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick 1
  assert_success

  # Change frontier by appending a new patch (lamport tick 3).
  seed_graph "append-patch.js"

  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick=+1
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["tick"] == 2, f"expected tick=2, got {data['tick']}"
assert data["maxTick"] == 3, f"expected maxTick=3 after append, got {data['maxTick']}"
assert data["diff"] is None, f"expected diff=null due to frontier change, got {data['diff']}"
PY
}

@test "seek --diff --json first seek shows empty baseline with all additions" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick 1 --diff
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["diffBaseline"] == "empty", f"expected diffBaseline='empty', got {data['diffBaseline']}"
assert data["baselineTick"] is None, f"expected baselineTick=null, got {data['baselineTick']}"
sd = data["structuralDiff"]
assert len(sd["nodes"]["added"]) == 3, f"expected 3 added nodes, got {len(sd['nodes']['added'])}"
assert len(sd["nodes"]["removed"]) == 0, f"expected 0 removed nodes, got {len(sd['nodes']['removed'])}"
assert data["truncated"] is False, f"expected truncated=false, got {data['truncated']}"
PY
}

@test "seek --tick=+1 --diff --json shows forward structural diff" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick 1
  assert_success

  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick=+1 --diff
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["tick"] == 2, f"expected tick=2, got {data['tick']}"
assert data["diffBaseline"] == "tick", f"expected diffBaseline='tick', got {data['diffBaseline']}"
assert data["baselineTick"] == 1, f"expected baselineTick=1, got {data['baselineTick']}"
sd = data["structuralDiff"]
assert len(sd["edges"]["added"]) == 2, f"expected 2 added edges, got {len(sd['edges']['added'])}"
assert len(sd["nodes"]["added"]) == 0, f"expected 0 added nodes, got {len(sd['nodes']['added'])}"
PY
}

@test "seek --tick=-1 --diff --json shows backward structural diff" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick 2
  assert_success

  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick=-1 --diff
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["tick"] == 1, f"expected tick=1, got {data['tick']}"
assert data["diffBaseline"] == "tick", f"expected diffBaseline='tick', got {data['diffBaseline']}"
assert data["baselineTick"] == 2, f"expected baselineTick=2, got {data['baselineTick']}"
sd = data["structuralDiff"]
assert len(sd["edges"]["removed"]) == 2, f"expected 2 removed edges, got {len(sd['edges']['removed'])}"
PY
}

@test "seek --diff ASCII output contains Changes section" {
  run git warp --repo "${TEST_REPO}" --graph demo seek --tick 1 --diff
  assert_success
  echo "$output" | grep -q "Changes (baseline: empty):"
  echo "$output" | grep -q "+ node"
}

@test "seek --diff --latest --json shows structural diff" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick 1
  assert_success

  run git warp --repo "${TEST_REPO}" --graph demo --json seek --latest --diff
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["action"] == "latest", f"expected action='latest', got {data['action']}"
assert "structuralDiff" in data, "expected structuralDiff in payload"
sd = data["structuralDiff"]
assert data["diffBaseline"] == "tick", f"expected diffBaseline='tick', got {data['diffBaseline']}"
assert data["baselineTick"] == 1, f"expected baselineTick=1, got {data['baselineTick']}"
PY
}

@test "seek --diff-limit=0 is rejected" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick 1 --diff --diff-limit=0
  assert_failure
  echo "$output" | grep -qi "positive integer"
}

@test "seek --diff-limit without value is rejected" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick 1 --diff --diff-limit
  assert_failure
  echo "$output" | grep -qi "missing value"
}

@test "seek --diff-limit=-1 is rejected" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick 1 --diff --diff-limit=-1
  assert_failure
  echo "$output" | grep -qi "positive integer"
}

@test "seek --diff with --save is rejected" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick 1
  assert_success

  run git warp --repo "${TEST_REPO}" --graph demo --json seek --save snap1 --diff
  assert_failure
  echo "$output" | grep -qi "cannot be used"
}

@test "seek --diff on bare status is rejected" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --diff
  assert_failure
  echo "$output" | grep -qi "cannot be used"
}

@test "seek --diff-limit without --diff is rejected" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick 1 --diff-limit=10
  assert_failure
  echo "$output" | grep -qi "requires --diff"
}

@test "seek --diff-limit=1.5 is rejected as non-integer" {
  run git warp --repo "${TEST_REPO}" --graph demo --json seek --tick 1 --diff --diff-limit=1.5
  assert_failure
  echo "$output" | grep -qi "positive integer"
}
