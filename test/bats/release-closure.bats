#!/usr/bin/env bats
# Size: medium; real subprocesses/filesystem, controlled transport, no network.
# Oracle: .github/RELEASE.md, Registry-backed closure contract. Fixtures violate
# one promise at a time; success requires the public CLI's receipt and exit code.

setup() {
  REPO_ROOT=$(cd "$BATS_TEST_DIRNAME/../.." && pwd)
  export CLOSURE_FIXTURE_DIR
  CLOSURE_FIXTURE_DIR=$(mktemp -d)
  export CLOSURE_FIXTURE_COMMIT=1111111111111111111111111111111111111111
  export CLOSURE_FIXTURE_MODE=success
  export CLOSURE_FIXTURE_INTEGRITY
  CLOSURE_FIXTURE_INTEGRITY="sha512-$(printf 'fixture archive' | openssl dgst -sha512 -binary | openssl base64 -A)"
  export GIT_WARP_CLOSURE_ATTEMPTS=3
  export GIT_WARP_CLOSURE_DELAY_SECONDS=0
  export LC_ALL=C TZ=UTC
  export TMPDIR="$CLOSURE_FIXTURE_DIR"
  mkdir "$CLOSURE_FIXTURE_DIR/bin"
  for tool in git gh npm curl; do
    cp "$BATS_TEST_DIRNAME/fixtures/release-closure-command.sh" "$CLOSURE_FIXTURE_DIR/bin/$tool"
    chmod +x "$CLOSURE_FIXTURE_DIR/bin/$tool"
  done
  export PATH="$CLOSURE_FIXTURE_DIR/bin:$PATH"
  RECEIPT="$CLOSURE_FIXTURE_DIR/receipt.json"
}

teardown() { rm -rf "$CLOSURE_FIXTURE_DIR"; }

verify_release() {
  run bash "$REPO_ROOT/scripts/verify-published-release.sh" \
    --tag v19.1.0 --commit "$CLOSURE_FIXTURE_COMMIT" --run-id 123 \
    --output "$RECEIPT" "$@"
}

assert_failed() {
  [ "$status" -ne 0 ] || {
    echo "assertion: invalid release must exit nonzero; actual exit $status" >&2
    return 1
  }
  [ "$(jq -r .status "$RECEIPT")" = failed ] || {
    echo 'assertion: failed release must retain a valid failed receipt' >&2
    return 1
  }
  [ "$(jq -r .stage "$RECEIPT")" = "$1" ] || {
    echo "assertion: failed release must name stage $1" >&2
    return 1
  }
}

@test "release closure proves public identity and an independent consumer" {
  verify_release --require-dist-tag
  [ "$status" -eq 0 ]
  jq -e '.status=="verified" and .consumer.registrySignatures=="verified" and
    .consumer.privateStorageFirewall=="passed" and .distTag.ownsTag==true and
    (.consumer.dependencies|length)==2' "$RECEIPT"
  [ "$(cat "$CLOSURE_FIXTURE_DIR/executed-code")" = "$(printf 'import\ncli')" ]
  ! grep -E '^(npm (publish|dist-tag)|git (push|tag)|gh (release|workflow)) ' "$CLOSURE_FIXTURE_DIR/commands"
}

@test "release closure retries delayed visibility in both registries" {
  export CLOSURE_FIXTURE_MODE=delayed
  verify_release
  [ "$status" -eq 0 ]
  [ "$(cat "$CLOSURE_FIXTURE_DIR/npm-attempts")" = 3 ]
  [ "$(cat "$CLOSURE_FIXTURE_DIR/jsr-attempts")" = 3 ]
}

@test "release closure exhausts a finite visibility budget" {
  export CLOSURE_FIXTURE_MODE=unavailable
  verify_release
  assert_failed registry
  [ "$(cat "$CLOSURE_FIXTURE_DIR/npm-attempts")" = 3 ]
}

@test "release closure terminates a stalled external command" {
  export CLOSURE_FIXTURE_MODE=hang
  export GIT_WARP_CLOSURE_ATTEMPTS=1
  export GIT_WARP_CLOSURE_COMMAND_TIMEOUT_SECONDS=1
  # This OS-level timeout contract has an independent outer watchdog. Its
  # timeout is a failure, never evidence that the verifier enforced its limit.
  run timeout --kill-after=1s 8s bash "$REPO_ROOT/scripts/verify-published-release.sh" \
    --tag v19.1.0 --commit "$CLOSURE_FIXTURE_COMMIT" --run-id 123 --output "$RECEIPT"
  [ "$status" -ne 124 ]
  [ "$status" -ne 137 ]
  assert_failed registry
  [ "$(cat "$CLOSURE_FIXTURE_DIR/npm-attempts")" = 1 ]
}

@test "release closure bounds the total verification time and retains a failed receipt" {
  export CLOSURE_FIXTURE_MODE=slow-chain
  export GIT_WARP_CLOSURE_TOTAL_TIMEOUT_SECONDS=2
  export GIT_WARP_CLOSURE_COMMAND_TIMEOUT_SECONDS=5
  verify_release
  assert_failed source
  jq -e '.budget.limitSeconds==2 and .budget.exhausted==true' "$RECEIPT"
}

@test "release closure includes consumer installation in its aggregate time budget" {
  export CLOSURE_FIXTURE_MODE=slow-consumer
  export GIT_WARP_CLOSURE_TOTAL_TIMEOUT_SECONDS=5
  verify_release
  assert_failed consumer
  [ -e "$CLOSURE_FIXTURE_DIR/consumer-install-started" ]
  [ ! -e "$CLOSURE_FIXTURE_DIR/executed-code" ]
  jq -e '.budget.limitSeconds==5 and .budget.exhausted==true' "$RECEIPT"
}

@test "release closure rejects a changed public tag" {
  export CLOSURE_FIXTURE_MODE=wrong-tag
  verify_release
  assert_failed source
}

@test "release closure rejects a publishing run from a different commit" {
  export CLOSURE_FIXTURE_MODE=wrong-run
  verify_release
  assert_failed source
}

@test "release closure retains a failed receipt after malformed GitHub transport" {
  export CLOSURE_FIXTURE_MODE=malformed-github
  verify_release
  assert_failed source
}

@test "release closure rejects conflicting npm identity without retrying" {
  export CLOSURE_FIXTURE_MODE=wrong-npm
  verify_release
  assert_failed registry
  [ "$(cat "$CLOSURE_FIXTURE_DIR/npm-attempts")" = 1 ]
}

@test "release closure rejects absent provenance" {
  export CLOSURE_FIXTURE_MODE=no-provenance
  verify_release
  assert_failed registry
}

@test "release closure hashes the JSR archive against registry integrity" {
  export CLOSURE_FIXTURE_MODE=corrupt-jsr
  verify_release
  assert_failed jsr-integrity
}

@test "release closure rejects npm consumer integrity mismatch" {
  export CLOSURE_FIXTURE_MODE=corrupt-npm
  verify_release
  assert_failed consumer
  [ "$(jq -r .consumer.stage "$RECEIPT")" = integrity ]
}

@test "release closure rejects consumer installation failure" {
  export CLOSURE_FIXTURE_MODE=install-failed
  verify_release
  assert_failed consumer
  [ "$(jq -r .consumer.stage "$RECEIPT")" = install ]
}

@test "release closure executes the public import rather than checking metadata" {
  export CLOSURE_FIXTURE_MODE=broken-import
  verify_release
  assert_failed consumer
  [ "$(jq -r .consumer.stage "$RECEIPT")" = imports ]
}

@test "release closure rejects a newly exposed private storage import" {
  export CLOSURE_FIXTURE_MODE=private-leak
  verify_release
  assert_failed consumer
  [ "$(jq -r .consumer.stage "$RECEIPT")" = imports ]
}

@test "release closure executes the installed CLI" {
  export CLOSURE_FIXTURE_MODE=cli-failed
  verify_release
  assert_failed consumer
  [ "$(jq -r .consumer.stage "$RECEIPT")" = cli ]
}

@test "release closure rejects failed signature or attestation verification" {
  export CLOSURE_FIXTURE_MODE=signatures-failed
  verify_release
  assert_failed consumer
  [ "$(jq -r .consumer.stage "$RECEIPT")" = signatures ]
  [ ! -e "$CLOSURE_FIXTURE_DIR/executed-code" ]
}

@test "new publication must own its intended dist-tag" {
  export CLOSURE_FIXTURE_MODE=advanced-tag
  verify_release --require-dist-tag
  assert_failed registry
}

@test "immutable historical verification records an advanced dist-tag honestly" {
  export CLOSURE_FIXTURE_MODE=advanced-tag
  verify_release
  [ "$status" -eq 0 ]
  jq -e '.status=="verified" and .distTag.ownsTag==false and
    .distTag.observedVersion=="19.2.0" and .distTag.ownershipRequired==false' "$RECEIPT"
  cp "$RECEIPT" "$CLOSURE_FIXTURE_DIR/first.json"
  verify_release
  [ "$status" -eq 0 ]
  cmp "$RECEIPT" "$CLOSURE_FIXTURE_DIR/first.json"
}
