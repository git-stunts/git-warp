#!/usr/bin/env bats

load helpers/setup.bash

setup() {
  setup_test_repo
  seed_graph "seed-graph.js"
}

teardown() {
  teardown_test_repo
}

@test "--ndjson query produces single valid JSON line" {
  run git warp --repo "${TEST_REPO}" --graph demo --ndjson query --match "*"
  assert_success
  # Must be exactly one line
  local line_count
  line_count=$(echo "$output" | wc -l | tr -d ' ')
  [ "$line_count" -eq 1 ]
  # Must parse as JSON
  echo "$output" | node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))"
}

@test "--ndjson materialize produces single valid JSON line" {
  run git warp --repo "${TEST_REPO}" --ndjson materialize
  assert_success
  local line_count
  line_count=$(echo "$output" | wc -l | tr -d ' ')
  [ "$line_count" -eq 1 ]
  echo "$output" | node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))"
}

@test "--ndjson output has no _-prefixed keys" {
  run git warp --repo "${TEST_REPO}" --graph demo --ndjson query --match "*"
  assert_success
  # Check no underscore-prefixed keys in output
  echo "$output" | node -e "
    const obj = JSON.parse(require('fs').readFileSync(0,'utf8'));
    const bad = Object.keys(obj).filter(k => k.startsWith('_'));
    if (bad.length) { console.error('Found _-prefixed keys:', bad); process.exit(1); }
  "
}

@test "--ndjson + --json is rejected" {
  run git warp --repo "${TEST_REPO}" --ndjson --json info
  assert_failure
  echo "$output" | grep -q "mutually exclusive"
}

@test "--ndjson + --view is rejected" {
  run git warp --repo "${TEST_REPO}" --graph demo --ndjson --view query --match "*"
  assert_failure
  echo "$output" | grep -q "mutually exclusive"
}

@test "error with --ndjson produces single-line JSON" {
  run git warp --repo /nonexistent/path --ndjson info
  assert_failure
  # stdout should be single-line JSON with error key
  local line_count
  line_count=$(echo "$output" | wc -l | tr -d ' ')
  [ "$line_count" -le 2 ]
  echo "$output" | head -1 | node -e "
    const obj = JSON.parse(require('fs').readFileSync(0,'utf8'));
    if (!obj.error) { console.error('Missing error key'); process.exit(1); }
  "
}
