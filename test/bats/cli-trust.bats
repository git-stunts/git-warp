#!/usr/bin/env bats

# B40 — BATS E2E tests for `git warp trust`
#
# Tests:
# 1. No trust records → not_configured
# 2. Valid trust chain → pass
# 3. --mode enforce + untrusted → exit 4
# 4. --mode warn + untrusted → exit 0
# 5. --trust-pin <sha>
# 6. WARP_TRUST_PIN=<sha>
# 7. --json output shape

load helpers/setup.bash

# ── Tests without trust records ──────────────────────────────────────────────

@test "trust: no records → exit 0, trustVerdict not_configured" {
  setup_test_repo
  seed_graph "seed-graph.js"

  run git warp --repo "${TEST_REPO}" --graph demo --json trust
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["trustVerdict"] == "not_configured", f"Expected not_configured, got {data['trustVerdict']}"
assert data["graph"] == "demo"
assert data["trust"]["status"] == "not_configured"
assert data["trust"]["source"] == "none"
PY

  teardown_test_repo
}

# ── Tests with trust records ─────────────────────────────────────────────────

@test "trust: valid chain → exit 0, trustVerdict pass" {
  setup_test_repo
  seed_graph "seed-trust.js"

  run git warp --repo "${TEST_REPO}" --graph demo --json trust
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["trustVerdict"] == "pass", f"Expected pass, got {data['trustVerdict']}"
assert data["graph"] == "demo"
assert data["trust"]["source"] == "ref"
PY

  teardown_test_repo
}

@test "trust: --mode enforce + untrusted writer → exit 4" {
  setup_test_repo
  seed_graph "seed-trust.js"

  # Add an untrusted writer "bob"
  cd "${PROJECT_ROOT}"
  NODE_NO_WARNINGS=1 REPO_PATH="${TEST_REPO}" node --experimental-transform-types -e "
    import('./test/bats/helpers/seed-setup.ts').then(async ({ openGraph }) => {
      const g = await openGraph('demo', 'bob');
      const p = await g.createPatch();
      await p.addNode('user:eve').commit();
    }).then(() => process.exit(0), error => {
      console.error(error);
      process.exit(1);
    });
  "
  cd "${TEST_REPO}"

  run git warp --repo "${TEST_REPO}" --graph demo --json trust --mode enforce
  [ "$status" -eq 4 ]

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["trustVerdict"] == "fail", f"Expected fail, got {data['trustVerdict']}"
PY

  teardown_test_repo
}

@test "trust: --mode warn + untrusted writer → exit 0" {
  setup_test_repo
  seed_graph "seed-trust.js"

  # Add an untrusted writer "bob"
  cd "${PROJECT_ROOT}"
  NODE_NO_WARNINGS=1 REPO_PATH="${TEST_REPO}" node --experimental-transform-types -e "
    import('./test/bats/helpers/seed-setup.ts').then(async ({ openGraph }) => {
      const g = await openGraph('demo', 'bob');
      const p = await g.createPatch();
      await p.addNode('user:eve').commit();
    }).then(() => process.exit(0), error => {
      console.error(error);
      process.exit(1);
    });
  "
  cd "${TEST_REPO}"

  run git warp --repo "${TEST_REPO}" --graph demo --json trust --mode warn
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
# warn mode returns pass or fail but exit 0
assert data["trustVerdict"] in ("pass", "fail"), f"Unexpected verdict: {data['trustVerdict']}"
PY

  teardown_test_repo
}

@test "trust: --trust-pin <sha> → source cli_pin" {
  setup_test_repo
  seed_graph "seed-trust.js"

  # Get the trust record ref tip
  TRUST_TIP=$(cd "${TEST_REPO}" && git rev-parse refs/warp/demo/trust/records 2>/dev/null || echo "")
  [ -n "$TRUST_TIP" ]

  run git warp --repo "${TEST_REPO}" --graph demo --json trust --trust-pin "${TRUST_TIP}"
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["trust"]["source"] == "cli_pin", f"Expected cli_pin, got {data['trust']['source']}"
PY

  teardown_test_repo
}

@test "trust: WARP_TRUST_PIN env → source env_pin" {
  setup_test_repo
  seed_graph "seed-trust.js"

  TRUST_TIP=$(cd "${TEST_REPO}" && git rev-parse refs/warp/demo/trust/records 2>/dev/null || echo "")
  [ -n "$TRUST_TIP" ]

  WARP_TRUST_PIN="${TRUST_TIP}" run git warp --repo "${TEST_REPO}" --graph demo --json trust
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["trust"]["source"] == "env_pin", f"Expected env_pin, got {data['trust']['source']}"
PY

  teardown_test_repo
}

@test "trust: --json output has required shape" {
  setup_test_repo
  seed_graph "seed-trust.js"

  run git warp --repo "${TEST_REPO}" --graph demo --json trust
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])

# Top-level required fields
assert "graph" in data
assert "trustSchemaVersion" in data
assert "trustVerdict" in data
assert "trust" in data

# Trust block required fields
trust = data["trust"]
assert "status" in trust
assert "source" in trust
assert "sourceDetail" in trust
assert "evaluatedWriters" in trust
assert "untrustedWriters" in trust
assert "evidenceSummary" in trust

# Evidence summary fields
ev = trust["evidenceSummary"]
assert "recordsScanned" in ev
assert "activeKeys" in ev
PY

  teardown_test_repo
}
