#!/usr/bin/env bats
# Size: medium; real subprocesses/filesystem, controlled transport, no network.
# Oracle: .github/RELEASE.md, Registry-backed closure contract. Fixtures violate
# one promise at a time; success requires the public CLI's receipt and exit code.

load helpers/docker.bash

setup_file() {
  require_docker_tests
}

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
  cp "$BATS_TEST_DIRNAME/fixtures/release-consumer-docker.sh" "$CLOSURE_FIXTURE_DIR/bin/docker"
  chmod +x "$CLOSURE_FIXTURE_DIR/bin/docker"
  export CLOSURE_FIXTURE_DEPENDENCIES="$REPO_ROOT/node_modules"
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
  jq -e '.consumer.execution=={boundary:"copy-docker",evidence:"complete",cleanup:"complete"}' "$RECEIPT"
  [ -f "$CLOSURE_FIXTURE_DIR/receipt.consumer/install.log" ]
  [ -f "$CLOSURE_FIXTURE_DIR/receipt.consumer/signatures.log" ]
  [ -f "$CLOSURE_FIXTURE_DIR/receipt.consumer/cli.log" ]
  [ -e "$CLOSURE_FIXTURE_DIR/container-removed" ]
  [ -e "$CLOSURE_FIXTURE_DIR/image-removed" ]
  ! grep -E 'docker .*(--mount|--volume| -v |--env| -e )' "$CLOSURE_FIXTURE_DIR/commands"
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

@test "direct consumer refuses forged Docker and CI flags before package operations" {
  mkdir "$CLOSURE_FIXTURE_DIR/direct"
  printf '{"dist":{"integrity":"%s"}}\n' "$CLOSURE_FIXTURE_INTEGRITY" > "$CLOSURE_FIXTURE_DIR/direct/npm.json"
  run env GIT_STUNTS_DOCKER=1 GITHUB_ACTIONS=true \
    NODE_OPTIONS="--import=$BATS_TEST_DIRNAME/fixtures/HideDockerMarker.mjs" \
    bash "$REPO_ROOT/scripts/release-closure/consumer.sh" \
    "$CLOSURE_FIXTURE_DIR/direct" @git-stunts/git-warp 19.1.0 30
  [ "$status" -ne 0 ]
  [ ! -f "$CLOSURE_FIXTURE_DIR/commands" ] || {
    echo 'assertion: direct host consumer must refuse before package operations' >&2
    return 1
  }
  [ ! -f "$CLOSURE_FIXTURE_DIR/executed-code" ]
}

@test "consumer image preparation consumes the original aggregate budget" {
  export CLOSURE_FIXTURE_MODE=slow-image
  export GIT_WARP_CLOSURE_TOTAL_TIMEOUT_SECONDS=3
  verify_release
  assert_failed consumer
  jq -e '.budget.exhausted==true and .consumer.stage=="prepare"' "$RECEIPT"
  [ -f "$CLOSURE_FIXTURE_DIR/receipt.consumer/image.log" ]
  [ ! -e "$CLOSURE_FIXTURE_DIR/executed-code" ]
}

@test "consumer image failure retains useful preparation diagnostics" {
  export CLOSURE_FIXTURE_MODE=image-failed
  verify_release
  assert_failed consumer
  grep -F 'controlled image failure' "$CLOSURE_FIXTURE_DIR/receipt.consumer/image.log"
  [ ! -e "$CLOSURE_FIXTURE_DIR/executed-code" ]
}

@test "consumer receives only the budget left after image preparation" {
  export CLOSURE_FIXTURE_MODE=slow-image-consumer
  export GIT_WARP_CLOSURE_TOTAL_TIMEOUT_SECONDS=5
  verify_release
  assert_failed consumer
  [ "$(cat "$CLOSURE_FIXTURE_DIR/consumer-budget")" -lt 5 ]
  [ -e "$CLOSURE_FIXTURE_DIR/consumer-install-started" ]
  [ ! -e "$CLOSURE_FIXTURE_DIR/executed-code" ]
  jq -e '.budget.exhausted==true' "$RECEIPT"
}

@test "consumer missing or invalid metadata refuses before image preparation" {
  mkdir "$CLOSURE_FIXTURE_DIR/direct"
  for metadata in missing invalid; do
    if [ "$metadata" = invalid ]; then
      printf '{"name":"@git-stunts/git-warp","version":"19.1.0"}\n' > "$CLOSURE_FIXTURE_DIR/direct/npm.json"
    fi
    run bash "$REPO_ROOT/scripts/release-closure/RunDockerConsumer.sh" \
      "$CLOSURE_FIXTURE_DIR/direct" @git-stunts/git-warp 19.1.0 30
    [ "$status" -ne 0 ]
    ! grep -E '^docker build|^npm ' "$CLOSURE_FIXTURE_DIR/commands"
    jq -e '.status=="failed" and .stage=="prepare"' "$CLOSURE_FIXTURE_DIR/direct/consumer.json"
  done
}

@test "consumer create failure still removes the owned container" {
  export CLOSURE_FIXTURE_MODE=create-failed
  verify_release
  assert_failed consumer
  jq -e '.consumer.stage=="create"' "$RECEIPT"
  [ -e "$CLOSURE_FIXTURE_DIR/container-stopped" ]
  [ -e "$CLOSURE_FIXTURE_DIR/container-removed" ]
}

@test "consumer export rejects missing malformed and incomplete success receipts" {
  for mode in missing-receipt malformed-receipt symlink-receipt false-receipt export-failed log-export-failed; do
    export CLOSURE_FIXTURE_MODE="$mode"
    verify_release
    assert_failed consumer
    jq -e '.consumer.status=="failed" and .consumer.stage=="export"' "$RECEIPT"
    [ -f "$CLOSURE_FIXTURE_DIR/receipt.consumer/export.log" ]
    [ -e "$CLOSURE_FIXTURE_DIR/container-removed" ]
  done
}

@test "consumer cleanup failure cannot report verified closure" {
  export CLOSURE_FIXTURE_MODE=cleanup-failed
  verify_release
  assert_failed consumer
  jq -e '.consumer.execution.cleanup=="failed"' "$RECEIPT"
}

@test "consumer diagnostics belong to the current run and refuse symlink destinations" {
  verify_release
  [ "$status" -eq 0 ]
  [ -f "$CLOSURE_FIXTURE_DIR/receipt.consumer/cli.log" ]
  export CLOSURE_FIXTURE_MODE=image-failed
  verify_release
  assert_failed consumer
  [ ! -e "$CLOSURE_FIXTURE_DIR/receipt.consumer/cli.log" ]
  [ ! -e "$CLOSURE_FIXTURE_DIR/receipt.consumer/signatures.log" ]
  grep -F 'controlled image failure' "$CLOSURE_FIXTURE_DIR/receipt.consumer/image.log"
  rm -rf "$CLOSURE_FIXTURE_DIR/receipt.consumer"
  mkdir "$CLOSURE_FIXTURE_DIR/unrelated"
  ln -s "$CLOSURE_FIXTURE_DIR/unrelated" "$CLOSURE_FIXTURE_DIR/receipt.consumer"
  export CLOSURE_FIXTURE_MODE=success
  verify_release
  assert_failed consumer-evidence
  [ -z "$(ls -A "$CLOSURE_FIXTURE_DIR/unrelated")" ]
}

@test "consumer cancellation removes its container and retains a failed receipt" {
  export CLOSURE_FIXTURE_MODE=canceled-consumer
  bash "$REPO_ROOT/scripts/verify-published-release.sh" \
    --tag v19.1.0 --commit "$CLOSURE_FIXTURE_COMMIT" --run-id 123 --output "$RECEIPT" \
    > "$CLOSURE_FIXTURE_DIR/canceled.log" 2>&1 &
  driver=$!
  for attempt in $(seq 1 100); do
    [ ! -e "$CLOSURE_FIXTURE_DIR/consumer-started" ] || break
    sleep 0.05
  done
  [ -e "$CLOSURE_FIXTURE_DIR/consumer-started" ]
  kill -TERM "$driver"
  status=0
  wait "$driver" || status=$?
  assert_failed consumer
  [ -e "$CLOSURE_FIXTURE_DIR/container-removed" ]
  [ -f "$CLOSURE_FIXTURE_DIR/receipt.consumer/container.log" ]
}
