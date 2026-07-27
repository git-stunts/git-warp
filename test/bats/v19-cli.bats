#!/usr/bin/env bats

load helpers/setup.bash

setup() {
  setup_test_repo
}

teardown() {
  teardown_test_repo
}

@test "help publishes only the v19 command vocabulary" {
  run "${CLI[@]}" --help
  assert_success

  [[ "$output" == *"git warp write"* ]]
  [[ "$output" == *"git warp observe"* ]]
  [[ "$output" == *"git warp settle preview"* ]]
  [[ "$output" == *"--strand <name>"* ]]
  [[ "$output" == *"--jsonl"* ]]
  [[ "$output" != *"--graph"* ]]
  [[ "$output" != *"--ndjson"* ]]
  [[ "$output" != *"query result page"* ]]
}

@test "write returns a canonical Receipt envelope" {
  write_user

  JSON="$output" python3 - <<'PY'
import json
import os

receipt = json.loads(os.environ["JSON"])
assert receipt["type"] == "Receipt"
assert receipt["operation"] == "write"
assert receipt["lane"] == "users"
assert receipt["writer"] == "bats"
assert receipt["intent"] == {
    "kind": "node.add",
    "subject": "user:alice",
}
assert receipt["outcome"]["kind"] == "derived"
PY
}

@test "repair prepares a bounded basis and observe emits Reading.value" {
  prepare_user_reading

  run "${CLI[@]}" observe \
    --lane users \
    --writer bats \
    --json \
    --observer users.exists \
    --reading '{"kind":"node.exists","subject":"user:alice"}'
  assert_success

  JSON="$output" python3 - <<'PY'
import json
import os

observation = json.loads(os.environ["JSON"])
assert observation["type"] == "Observation"
assert observation["readings"][0]["type"] == "Reading"
assert observation["readings"][0]["value"] is True
assert "payload" not in observation["readings"][0]
assert observation["receipt"]["operation"] == "observe"
assert observation["receipt"]["status"] == "completed"
PY
}

@test "observe streams Reading and Receipt envelopes as JSON Lines" {
  prepare_user_reading

  run "${CLI[@]}" observe \
    --lane users \
    --writer bats \
    --jsonl \
    --observer users.exists \
    --reading '{"kind":"node.exists","subject":"user:alice"}'
  assert_success

  JSONL="$output" python3 - <<'PY'
import json
import os

lines = [json.loads(line) for line in os.environ["JSONL"].splitlines()]
assert [line["type"] for line in lines] == ["Reading", "Receipt"]
assert lines[0]["value"] is True
assert lines[1]["operation"] == "observe"
PY
}

@test "receipt show uses the same canonical human renderer" {
  write_user
  receipt_file="${TEST_REPO}/receipt.json"
  printf '%s\n' "$output" > "${receipt_file}"

  run "${CLI[@]}" receipt show --input "${receipt_file}"
  assert_success

  [[ "$output" == *"Receipt: write"* ]]
  [[ "$output" == *"resolution:"* ]]
  [[ "$output" == *'"type": "Receipt"'* ]]
}

@test "fork, write, preview, and apply survive CLI process boundaries" {
  prepare_user_reading

  run "${CLI[@]}" fork \
    --lane users \
    --writer bats \
    --json \
    --name review
  assert_success

  JSON="$output" python3 - <<'PY'
import json
import os

lane = json.loads(os.environ["JSON"])
assert lane["type"] == "Lane"
assert lane["kind"] == "strand"
assert lane["name"] == "review"
assert lane["source"] == {"kind": "worldline", "name": "users"}
PY

  run "${CLI[@]}" write \
    --lane users \
    --strand review \
    --writer bats \
    --json \
    --intent '{"kind":"property.set","subject":"user:alice","key":"role","value":"admin"}'
  assert_success

  plan_file="${TEST_REPO}/settlement-plan.json"
  run "${CLI[@]}" settle preview \
    --writer bats \
    --json \
    --source users \
    --strand review \
    --target users \
    --out "${plan_file}"
  assert_success

  JSON="$output" python3 - <<'PY'
import json
import os

preview = json.loads(os.environ["JSON"])
assert preview["type"] == "SettlementPreview"
assert preview["source"] == {"kind": "strand", "name": "review"}
assert preview["target"] == {"kind": "worldline", "name": "users"}
assert preview["selector"] == {
    "sourceLane": "users",
    "sourceStrand": "review",
    "targetLane": "users",
}
assert preview["plan"]["sourceLaneId"] == "strand:review"
assert preview["plan"]["targetLaneId"] == "worldline:users"
assert preview["outcome"]["kind"] == "derived"
PY

  run "${CLI[@]}" settle apply \
    --writer bats \
    --json \
    --plan "${plan_file}"
  assert_success

  JSON="$output" python3 - <<'PY'
import json
import os

receipt = json.loads(os.environ["JSON"])
assert receipt["type"] == "Receipt"
assert receipt["operation"] == "settle"
assert receipt["outcome"]["kind"] == "derived"
PY

  run "${CLI[@]}" observe \
    --lane users \
    --writer bats \
    --json \
    --observer users.role \
    --reading '{"kind":"property.get","subject":"user:alice","key":"role"}'
  assert_success

  JSON="$output" python3 - <<'PY'
import json
import os

observation = json.loads(os.environ["JSON"])
assert observation["readings"][0]["value"] == "admin"
PY
}

@test "MCP lists the generated capability tools without graph-first names" {
  run python3 - "${PROJECT_ROOT}" "${TEST_REPO}" <<'PY'
import json
import os
import subprocess
import sys

request = json.dumps({
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {},
}) + "\n"
result = subprocess.run(
    [
        "node",
        os.path.join(sys.argv[1], "dist", "bin", "git-warp.js"),
        "mcp",
        "--repo",
        sys.argv[2],
        "--writer",
        "bats",
    ],
    input=request,
    text=True,
    capture_output=True,
    timeout=10,
    check=False,
)
if result.returncode != 0:
    sys.stderr.write(result.stderr)
    raise SystemExit(result.returncode)
sys.stdout.write(result.stdout)
PY
  assert_success

  JSON="$output" python3 - <<'PY'
import json
import os

response = json.loads(os.environ["JSON"])
names = [tool["name"] for tool in response["result"]["tools"]]
assert names == [
    "warp_lane_describe",
    "warp_intent_write",
    "warp_observation_start",
    "warp_observation_read",
    "warp_observation_cancel",
    "warp_receipt_get",
    "warp_settlement_preview",
    "warp_settlement_apply",
    "warp_doctor",
    "warp_repair",
    "warp_audit",
]
assert not any(name in names for name in [
    "warp_nodes",
    "warp_node_props",
    "warp_edges",
    "warp_has_node",
])
PY
}

@test "removed graph-first commands fail closed" {
  run "${CLI[@]}" query --match '*'
  assert_failure
  [[ "$output" == *"Unknown command: query"* ]]
}
