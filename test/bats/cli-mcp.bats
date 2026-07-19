#!/usr/bin/env bats

load helpers/setup.bash

setup() {
  setup_test_repo
  seed_graph "seed-graph.js"
}

teardown() {
  teardown_test_repo
}

@test "mcp reports its package version and exits after stdin EOF" {
  run python3 - "${PROJECT_ROOT}" "${TEST_REPO}" <<'PY'
import json
import os
import subprocess
import sys

project_root = sys.argv[1]
dist_cli = os.path.join(project_root, "dist", "bin", "warp-graph.js")
source_cli = os.path.join(project_root, "bin", "warp-graph.ts")
cli = dist_cli if os.path.exists(dist_cli) else source_cli
request = json.dumps({
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {"protocolVersion": "2025-06-18"},
}) + "\n"
result = subprocess.run(
    ["node", cli, "--repo", sys.argv[2], "--graph", "demo", "mcp"],
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

  JSON="$output" PACKAGE_JSON="${PROJECT_ROOT}/package.json" python3 - <<'PY'
import json
import os

response = json.loads(os.environ["JSON"])
with open(os.environ["PACKAGE_JSON"], encoding="utf-8") as package_file:
    expected_version = json.load(package_file)["version"]
assert response["result"]["serverInfo"]["name"] == "git-warp"
assert response["result"]["serverInfo"]["version"] == expected_version
PY
}
