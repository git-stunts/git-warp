#!/usr/bin/env bash
# Check only #1099 witness tests, then source/test types and touched-file lint.
# Requires Bash >= 5.2, GNU timeout, Node and installed project dependencies.
# Arguments: none. Run from the project root in the root agent's COPY worker.
# Each command has its own finite deadline and 10-second termination grace.
# The outer worker owns CPU/memory/disk/output quotas and descendant cleanup.
# Status: first failing command, 2 for usage, 124/137 for a deadline.
# Test scratch belongs to the tests; abnormal-child leftovers stay in tmpfs.

main() {
  if ((BASH_VERSINFO[0] < 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] < 2))); then
    printf 'requires Bash >= 5.2; got %s\n' "$BASH_VERSION" >&2
    return 2
  fi
  set -euo pipefail
  shopt -s inherit_errexit
  shopt -u patsub_replacement
  unset CDPATH GLOBIGNORE
  umask 077
  if (($# != 0)); then
    printf '%s\n' 'Usage: bash test/fixtures/runConeShowcaseGreen.sh' >&2
    return 2
  fi
  if [[ ! -f /.dockerenv ]]; then
    printf '%s\n' '#1099 checks require the COPY-based Docker worker.' >&2
    return 2
  fi
  command -v timeout >/dev/null
  command -v node >/dev/null
  [[ -f scripts/run-in-docker.sh && -f node_modules/vitest/vitest.mjs ]]
  timeout --signal=TERM --kill-after=10s 180s \
    bash scripts/run-in-docker.sh node node_modules/vitest/vitest.mjs run \
    test/unit/benchmark/coneShowcaseOracle.test.ts \
    test/unit/benchmark/coneShowcaseArguments.test.ts \
    test/unit/benchmark/coneShowcaseTransport.test.ts \
    test/unit/benchmark/coneShowcaseTraceCounter.test.ts \
    test/unit/benchmark/coneShowcaseAggregation.test.ts \
    --maxWorkers=1 --no-file-parallelism --reporter=verbose
  timeout --signal=TERM --kill-after=10s 180s node node_modules/typescript/bin/tsc --noEmit -p tsconfig.src.json
  timeout --signal=TERM --kill-after=10s 240s node node_modules/typescript/bin/tsc --noEmit -p tsconfig.test.json
  timeout --signal=TERM --kill-after=10s 120s node node_modules/eslint/bin/eslint.js \
    benchmarks/cone-showcase test/unit/benchmark/coneShowcase*.test.ts test/fixtures/coneShowcaseCounterCalibration.ts
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  main "$@"
fi
