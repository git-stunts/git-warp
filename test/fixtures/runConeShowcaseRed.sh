#!/usr/bin/env bash
# Run only the #1099 CLI, cold-transport and real-Git counter RED tests.
# Requires Bash >= 5.2, GNU timeout, Node and installed project dependencies.
# Arguments: none. Run from the project root in the root agent's COPY worker.
# The outer worker owns CPU/memory/disk/output quotas and descendant cleanup.
# This phase adds a 120-second deadline plus a 10-second termination grace.
# Stdout/stderr: bounded test evidence collected by the outer guard.
# Status: Vitest status, 2 for usage, 124/137 for the deadline; never invert RED.
# Runtime scratch belongs to the tests; the outer worker owns crash leftovers.

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
    printf '%s\n' 'Usage: bash test/fixtures/runConeShowcaseRed.sh' >&2
    return 2
  fi
  if [[ ! -f /.dockerenv ]]; then
    printf '%s\n' '#1099 RED tests require the COPY-based Docker worker.' >&2
    return 2
  fi
  command -v timeout >/dev/null
  command -v node >/dev/null
  [[ -f scripts/run-in-docker.sh && -f node_modules/vitest/vitest.mjs ]]
  exec timeout --signal=TERM --kill-after=10s 120s \
    bash scripts/run-in-docker.sh node node_modules/vitest/vitest.mjs run \
    test/unit/benchmark/coneShowcaseOracle.test.ts \
    --maxWorkers=1 --no-file-parallelism --reporter=verbose
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  main "$@"
fi
