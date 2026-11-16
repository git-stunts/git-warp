#!/usr/bin/env bats

load helpers/setup.bash

load helpers/docker.bash

setup_file() {
  require_docker_tests
}

setup() {
  setup_test_repo
}

teardown() {
  teardown_test_repo
}

@test "help publishes only the v19 command vocabulary" {
  run "${CLI[@]}" --help
  assert_success

  [[ "$output" == *"git warp observe"* ]]
  [[ "$output" != *"git warp write"* ]]
  [[ "$output" != *"git warp fork"* ]]
  [[ "$output" != *"git warp settle"* ]]
  [[ "$output" != *"--strand"* ]]
  [[ "$output" == *"--jsonl"* ]]
  [[ "$output" != *"--graph"* ]]
  [[ "$output" != *"--ndjson"* ]]
  [[ "$output" != *"query result page"* ]]
}

@test "removed write, fork and settle commands fail closed" {
  for command in write fork settle; do
    run "${CLI[@]}" "${command}" --lane users
    assert_failure
    [[ "$output" == *"Unknown command: ${command}"* ]]
  done
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
  prepare_user_reading
  run "${CLI[@]}" observe \
    --lane users \
    --writer bats \
    --json \
    --observer users.exists \
    --reading '{"kind":"node.exists","subject":"user:alice"}'
  assert_success
  receipt_file="${TEST_REPO}/receipt.json"
  JSON="$output" python3 -c 'import json, os, sys; json.dump(json.loads(os.environ["JSON"])["receipt"], sys.stdout)' > "${receipt_file}"

  run "${CLI[@]}" receipt show --input "${receipt_file}"
  assert_success

  [[ "$output" == *"Receipt: observe"* ]]
  [[ "$output" == *"resolution:"* ]]
  [[ "$output" == *'"type": "Receipt"'* ]]
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
    "warp_observation_start",
    "warp_observation_read",
    "warp_observation_cancel",
    "warp_receipt_get",
    "warp_doctor",
    "warp_repair",
    "warp_audit",
]
assert not any(name in names for name in [
    "warp_nodes",
    "warp_node_props",
    "warp_edges",
    "warp_has_node",
    "warp_lane_describe",
    "warp_intent_write",
    "warp_settlement_preview",
    "warp_settlement_apply",
])
PY
}

@test "removed graph-first commands fail closed" {
  run "${CLI[@]}" query --match '*'
  assert_failure
  [[ "$output" == *"Unknown command: query"* ]]
}
