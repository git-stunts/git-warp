#!/usr/bin/env bats

load helpers/setup.bash

setup() {
  setup_test_repo
}

teardown() {
  teardown_test_repo
}

# Helper: run a command capturing both stdout and stderr for JSON parsing.
# stderr is needed because present() routes error payloads there.
# Git diagnostic noise is tolerable since we parse via python3 json.loads().
_run_json() {
  local rc=0
  output=$("$@" 2>&1) || rc=$?
  status=$rc
}

# ── trust init ────────────────────────────────────────────────────────────────

@test "trust init creates trust ref with default policy" {
  seed_graph "seed-graph.js"

  run git warp --repo "${TEST_REPO}" --graph demo trust init
  assert_success
  echo "$output" | grep -q "Trust initialized"
  echo "$output" | grep -q "Policy: any"
}

@test "trust init --json returns config and commit" {
  seed_graph "seed-graph.js"

  _run_json git warp --repo "${TEST_REPO}" --graph demo --json trust init
  [ "$status" -eq 0 ]

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["action"] == "init"
assert data["graph"] == "demo"
assert "commit" in data
assert data["config"]["version"] == 1
assert data["config"]["policy"] == "any"
assert isinstance(data["config"]["trustedWriters"], list)
PY
}

@test "trust init --from-writers seeds from existing writer refs" {
  seed_graph "seed-graph.js"

  _run_json git warp --repo "${TEST_REPO}" --graph demo --json trust init --from-writers
  [ "$status" -eq 0 ]

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["action"] == "init"
assert "alice" in data["config"]["trustedWriters"]
assert len(data["seedWriters"]) >= 1
PY
}

@test "trust init double-init fails with conflict" {
  seed_graph "seed-graph.js"

  run git warp --repo "${TEST_REPO}" --graph demo trust init
  assert_success

  run git warp --repo "${TEST_REPO}" --graph demo trust init
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "already exists\|conflict"
}

# ── trust show ────────────────────────────────────────────────────────────────

@test "trust show --json returns config when trust is configured" {
  seed_graph "seed-trust-graph.js"

  _run_json git warp --repo "${TEST_REPO}" --graph demo --json trust show
  [ "$status" -eq 0 ]

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["action"] == "show"
assert data["config"]["version"] == 1
assert data["config"]["policy"] == "any"
assert "alice" in data["config"]["trustedWriters"]
assert "commit" in data
assert "snapshotDigest" in data
PY
}

@test "trust show returns error when trust not configured" {
  seed_graph "seed-graph.js"

  _run_json git warp --repo "${TEST_REPO}" --graph demo --json trust show
  [ "$status" -ne 0 ]

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["error"]["code"] == "E_NOT_FOUND"
PY
}

@test "trust show human output includes ref and policy" {
  seed_graph "seed-trust-graph.js"

  run git warp --repo "${TEST_REPO}" --graph demo trust show
  assert_success
  echo "$output" | grep -q "Ref:"
  echo "$output" | grep -q "Policy: any"
  echo "$output" | grep -q "alice"
}

# ── trust doctor ──────────────────────────────────────────────────────────────

@test "trust doctor --json healthy trust returns ok" {
  seed_graph "seed-trust-graph.js"

  _run_json git warp --repo "${TEST_REPO}" --graph demo --json trust doctor
  [ "$status" -eq 0 ]

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["action"] == "doctor"
assert data["health"] == "ok"
assert data["summary"]["fail"] == 0
assert data["summary"]["checksRun"] >= 3
PY
}

@test "trust doctor reports missing trust ref" {
  seed_graph "seed-graph.js"

  _run_json git warp --repo "${TEST_REPO}" --graph demo --json trust doctor
  [ "$status" -eq 0 ]

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["health"] == "failed"
ids = [f["id"] for f in data["findings"]]
assert "TRUST_REF_MISSING" in ids
PY
}

@test "trust doctor --strict with failure returns non-zero exit" {
  seed_graph "seed-graph.js"

  _run_json git warp --repo "${TEST_REPO}" --graph demo --json trust doctor --strict
  [ "$status" -ne 0 ]
}

# ── verify-audit with trust ──────────────────────────────────────────────────

@test "verify-audit --json includes trust assessment when trust is configured" {
  seed_graph "seed-trust-graph.js"

  _run_json git warp --repo "${TEST_REPO}" --graph demo --json verify-audit
  [ "$status" -eq 0 ]

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert "trust" in data
assert data["trust"]["status"] in ("configured", "pinned")
assert data["trust"]["policy"] == "any"
assert "integrityVerdict" in data
assert "trustVerdict" in data
assert data["trustVerdict"] in ("pass", "degraded")
PY
}

@test "verify-audit --trust-required exits non-zero when trust not configured" {
  seed_graph "seed-audit-graph.js"

  _run_json git warp --repo "${TEST_REPO}" --graph demo --json verify-audit --trust-required
  [ "$status" -ne 0 ]

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["trustVerdict"] == "not_configured"
PY
}

@test "verify-audit human output includes dual verdicts" {
  seed_graph "seed-trust-graph.js"

  run git warp --repo "${TEST_REPO}" --graph demo verify-audit
  assert_success
  echo "$output" | grep -q "Integrity:"
  echo "$output" | grep -q "Trust:"
}

# ── unknown sub-action ────────────────────────────────────────────────────────

@test "trust unknown sub-action returns usage error" {
  seed_graph "seed-graph.js"

  run git warp --repo "${TEST_REPO}" --graph demo trust banana
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "unknown\|banana"
}
