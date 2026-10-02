#!/usr/bin/env bats
# Size: medium; public CLI subprocesses and temporary Git storage, no network.
# Oracle: #869 receipt identity, exact-frontier settlement, retained source reads.

load helpers/docker.bash

setup_file() {
  require_docker_tests
  export SESSION_EVENT_EVIDENCE="$BATS_FILE_TMPDIR/session-event-evidence.json"
  python3 "$BATS_TEST_DIRNAME/helpers/SessionEventCapture.py" "$SESSION_EVENT_EVIDENCE"
}

verify_evidence() {
  run python3 "$BATS_TEST_DIRNAME/helpers/SessionEventEvidence.py" "$SESSION_EVENT_EVIDENCE" "$1"
  [ "$status" -eq 0 ] || {
    printf '%s\n' "$output" >&2
    return 1
  }
}

@test "session event receipts preserve four distinct identities" {
  verify_evidence identities
}

@test "one complete event birth returns one retained patch-support witness" {
  verify_evidence birth-support
}

@test "opaque direct-admission payload and application identities survive process restart" {
  verify_evidence direct-restart
}

@test "unchanged fork basis settles Alpha with exact derived classification and complete evidence" {
  verify_evidence alpha-derived
}

@test "stale Beta common basis is obstructed on both settlement preview and apply" {
  verify_evidence beta-obstruction
}

@test "settled Alpha and obstructed Beta remain recoverable in their source Strands" {
  verify_evidence retained-sources
}

@test "target retains Alpha and refuses Beta without partial publication or a forced winner" {
  verify_evidence target-authority
}

@test "negative target readings retain their own basis and tick coordinates" {
  verify_evidence negative-basis
}

@test "every write, fork, settlement, repair and observation crosses a fresh public CLI process" {
  verify_evidence process-boundaries
}

@test "load-bearing oracle mutations witness RED even with Python optimization enabled" {
  verify_evidence calibrations
  [[ "$output" == *"RED witnessed: identity-conflation"* ]]
  [[ "$output" == *"RED witnessed: one-birth-one-support"* ]]
  [[ "$output" == *"RED witnessed: opaque-restart-bytes"* ]]
  [[ "$output" == *"RED witnessed: complete-settlement-support"* ]]
  [[ "$output" == *"RED witnessed: stale-common-basis-reason"* ]]
  [[ "$output" == *"RED witnessed: no-forced-winner"* ]]
  [[ "$output" == *"RED witnessed: reading-basis-bound"* ]]
}
