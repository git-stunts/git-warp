#!/usr/bin/env bash
# Calibrate release assertions against named contract violations in owned copies.
# Mutation anchors are literal program text; expanding them would execute the
# subject while constructing the experiment, so SC2016 does not apply here.
# shellcheck disable=SC2016
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUTPUT="${1:?usage: calibrate.sh <receipt.json>}"
mkdir -p "$(dirname "$OUTPUT")"
OUTPUT=$(cd "$(dirname "$OUTPUT")" && pwd)/$(basename "$OUTPUT")
WORK=$(mktemp -d "${TMPDIR:-/tmp}/git-warp-closure-calibration.XXXXXX")
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/tree/scripts/release-closure" "$WORK/tree/test/bats/fixtures"
cp "$ROOT/test/bats/release-closure.bats" "$WORK/tree/test/bats/"
cp "$ROOT/test/bats/fixtures/release-closure-command.sh" "$WORK/tree/test/bats/fixtures/"
export LC_ALL=C TZ=UTC
RESULTS="$WORK/results.jsonl"
: > "$RESULTS"
INPUT_DIGEST=$(cat "$ROOT/scripts/verify-published-release.sh" \
  "$ROOT/scripts/release-closure/consumer.sh" "$ROOT/scripts/release-closure/calibrate.sh" \
  "$ROOT/scripts/release-closure/budget.sh" \
  "$ROOT/test/bats/release-closure.bats" "$ROOT/test/bats/fixtures/release-closure-command.sh" |
  openssl dgst -sha256 -binary | openssl base64 -A)
NODE_VERSION=$(node --version)
BATS_VERSION=$(bats --version)

reset_subject() {
  cp "$ROOT/scripts/verify-published-release.sh" "$WORK/tree/scripts/"
  cp "$ROOT/scripts/release-closure/consumer.sh" "$WORK/tree/scripts/release-closure/"
  cp "$ROOT/scripts/release-closure/budget.sh" "$WORK/tree/scripts/release-closure/"
}

replace_once() {
  local path="$WORK/tree/$1" before="$2" after="$3"
  jq -Rsj --arg before "$before" --arg after "$after" '
    split($before)|if length==2 then .[0]+$after+.[1]
    else error("mutation anchor must occur exactly once") end
  ' "$path" > "$WORK/replacement"
  mv "$WORK/replacement" "$path"
}

record() {
  # Logs must be shareable: scratch and checkout paths carry no release evidence.
  jq -n --arg mutation "$1" --arg test "$2" --arg verdict "$3" \
    --arg root "$ROOT" --arg work "$WORK" --rawfile log "$WORK/run.log" '
    {mutation:$mutation,test:$test,verdict:$verdict,
      output:($log|split($root)|join("<checkout>")|split($work)|join("<calibration>"))}
  ' >> "$RESULTS"
  jq -s --arg revision "$(git -C "$ROOT" rev-parse HEAD)" \
    --arg inputs "$INPUT_DIGEST" --arg bash "$BASH_VERSION" \
    --arg node "$NODE_VERSION" --arg bats "$BATS_VERSION" '
    {schema:"git-warp/release-calibration@1",revision:$revision,inputDigest:$inputs,
      tools:{bash:$bash,node:$node,bats:$bats},
      results:.,status:(if all(.[];.verdict=="killed" or .verdict=="baseline-passed")
      then "incomplete" else "failed" end)}' "$RESULTS" > "$OUTPUT"
}

reset_subject
if timeout --kill-after=5s 180s bats --formatter tap "$WORK/tree/test/bats/release-closure.bats" > "$WORK/run.log" 2>&1; then
  record baseline all baseline-passed
else
  record baseline all failed
  cat "$WORK/run.log"
  exit 1
fi

calibrate() {
  local name="$1" test="$2" assertion="$3" path="$4" before="$5" after="$6" code=0
  reset_subject
  replace_once "$path" "$before" "$after"
  bash -n "$WORK/tree/scripts/verify-published-release.sh"
  bash -n "$WORK/tree/scripts/release-closure/consumer.sh"
  bash -n "$WORK/tree/scripts/release-closure/budget.sh"
  timeout --kill-after=5s 30s bats --formatter tap --filter "^$test$" \
    "$WORK/tree/test/bats/release-closure.bats" > "$WORK/run.log" 2>&1 || code=$?
  # Exit 1 alone could be a setup crash or no selected test. Require the exact
  # test and failed assertion, excluding harness failures and external timeouts.
  if [ "$code" -eq 1 ] && rg -Fx "not ok 1 $test" "$WORK/run.log" >/dev/null &&
    rg -F "$assertion" "$WORK/run.log" >/dev/null; then
    record "$name" "$test" killed
    echo "killed: $name ($test)"
  else
    record "$name" "$test" uncalibrated
    cat "$WORK/run.log"
    echo "calibration failed: $name (BATS exit $code; expected assertion failure exit 1)" >&2
    exit 1
  fi
}

DRIVER=scripts/verify-published-release.sh
CONSUMER=scripts/release-closure/consumer.sh
BUDGET=scripts/release-closure/budget.sh
NONZERO='assertion: invalid release must exit nonzero'
SUCCESS='[ "$status" -eq 0 ]'
calibrate receipt-claim 'release closure proves public identity and an independent consumer' \
  'jq -e' "$CONSUMER" 'registrySignatures:"verified"' 'registrySignatures:"unverified"'
calibrate propagation-budget 'release closure retries delayed visibility in both registries' \
  "$SUCCESS" "$DRIVER" 'attempt=$((attempt + 1))' 'attempt=$((attempt + 2))'
calibrate finite-budget 'release closure exhausts a finite visibility budget' \
  'npm-attempts' "$DRIVER" 'local attempt=1' 'local attempt=0'
calibrate command-deadline 'release closure terminates a stalled external command' \
  '[ "$status" -ne 124 ]' "$BUDGET" \
  'timeout --kill-after=5s "${limit}s" "$@"' '"$@"'
calibrate total-deadline 'release closure bounds the total verification time and retains a failed receipt' \
  "$NONZERO" "$BUDGET" 'CLOSURE_DEADLINE=$((SECONDS + $1))' 'CLOSURE_DEADLINE=$((SECONDS + 720))'
calibrate consumer-deadline 'release closure includes consumer installation in its aggregate time budget' \
  "$NONZERO" "$BUDGET" 'CLOSURE_DEADLINE=$((SECONDS + $1))' 'CLOSURE_DEADLINE=$((SECONDS + 720))'
calibrate public-tag 'release closure rejects a changed public tag' \
  "$NONZERO" "$DRIVER" '[ "$(cat "$WORK/remote-commit")" = "$EXPECTED_COMMIT" ]' ':'
calibrate publishing-run 'release closure rejects a publishing run from a different commit' \
  "$NONZERO" "$DRIVER" '.head_sha==$commit and .repository' 'true and .repository'
calibrate failed-receipt 'release closure retains a failed receipt after malformed GitHub transport' \
  'assertion: failed release must retain a valid failed receipt' "$DRIVER" \
  '> "$OUTPUT"' '> "$WORK/discarded-receipt.json"'
calibrate npm-identity 'release closure rejects conflicting npm identity without retrying' \
  "$NONZERO" "$DRIVER" "'.gitHead==\$commit'" "'true'"
calibrate provenance 'release closure rejects absent provenance' \
  "$NONZERO" "$DRIVER" ".dist.attestations.provenance.predicateType==\"https://slsa.dev/provenance/v1\"" 'true'
calibrate jsr-integrity 'release closure hashes the JSR archive against registry integrity' \
  "$NONZERO" "$DRIVER" '[ "$JSR_INTEGRITY" = "$(jq -r .dist.integrity "$WORK/jsr.json")" ]' ':'
calibrate npm-integrity 'release closure rejects npm consumer integrity mismatch' \
  "$NONZERO" "$CONSUMER" '.integrity==$integrity' 'true'
calibrate installation-failure 'release closure rejects consumer installation failure' \
  'jq -r .consumer.stage' "$CONSUMER" '> "$WORK/install.log" 2>&1' '> "$WORK/install.log" 2>&1 || true'
calibrate root-export 'release closure executes the public import rather than checking metadata' \
  "$NONZERO" "$CONSUMER" "if (names.length !== 1 || names[0] !== 'Runtime' || typeof values.Runtime !== 'function')" 'if (false)'
calibrate private-export 'release closure rejects a newly exposed private storage import' \
  "$NONZERO" "$CONSUMER" 'if (!denied) throw' 'if (false) throw'
calibrate cli-execution 'release closure executes the installed CLI' \
  "$NONZERO" "$CONSUMER" '> "$WORK/cli.log" 2>&1' '> "$WORK/cli.log" 2>&1 || true'
calibrate signature-verification 'release closure rejects failed signature or attestation verification' \
  "$NONZERO" "$CONSUMER" '> "$WORK/signatures.log" 2>&1' '> "$WORK/signatures.log" 2>&1 || true'
calibrate dist-tag-ownership 'new publication must own its intended dist-tag' \
  "$NONZERO" "$DRIVER" '[ "$REQUIRE_DIST_TAG" -eq 1 ]' '[ "$REQUIRE_DIST_TAG" -eq 2 ]'
calibrate historical-dist-tag 'immutable historical verification records an advanced dist-tag honestly' \
  'jq -e' "$DRIVER" 'ownsTag:($owner[0]==$version)' 'ownsTag:true'
jq '.status="verified"' "$OUTPUT" > "$WORK/complete.json"
mv "$WORK/complete.json" "$OUTPUT"
echo 'release calibration: all named violations detected at their target assertions'
