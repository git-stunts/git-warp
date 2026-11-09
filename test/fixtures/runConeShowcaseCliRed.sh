#!/usr/bin/env bash
# Diagnostic-only #1099 CLI RED rerun; preserve every bounded child result.
# Requires Bash >= 5.2, GNU timeout, Node and installed project dependencies.
# Run without arguments from the root agent's admitted COPY project root.
# Existing outer guard owns CPU/memory/disk/output and descendant cleanup.
# Deadline: 60 seconds plus 10 seconds termination grace; no status inversion.
# Output: the three bounded child diagnostics and Vitest result, held by guard.

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
  if (($# != 0)) || [[ ! -f /.dockerenv ]]; then
    printf '%s\n' 'Run bash test/fixtures/runConeShowcaseCliRed.sh without arguments in the COPY Docker worker.' >&2
    return 2
  fi
  command -v timeout >/dev/null
  command -v node >/dev/null
  [[ -f scripts/run-in-docker.sh && -f node_modules/vitest/vitest.mjs ]]
  exec timeout --signal=TERM --kill-after=10s 60s \
    bash scripts/run-in-docker.sh node node_modules/vitest/vitest.mjs run \
    test/unit/benchmark/coneShowcaseOracle.test.ts \
    --testNamePattern='cone-showcase command line' \
    --maxWorkers=1 --no-file-parallelism --reporter=verbose
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  main "$@"
fi
