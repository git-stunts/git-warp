#!/usr/bin/env bash
# shellcheck shell=bash
set -euo pipefail

# Anti-SLUDGE shell checks for git-warp.
#
# Runs regex sweeps and filename checks that are cheaper/clearer to
# express as shell than as ESLint or Semgrep rules.
#
# Policy: docs/ANTI_SLUDGE_POLICY.md
# Quarantines: policy/quarantines/0025{A,B,C,D}-*.json (file-scoped
# exemptions are honored by ESLint/Semgrep; this script's patterns
# are checks that do NOT consult the manifests — they complement
# the main tools rather than replace them).

fail=0

check_filenames() {
  local matches
  matches="$(find src -type f \( \
    -name 'utils.ts' -o \
    -name 'helpers.ts' -o \
    -name 'misc.ts' -o \
    -name 'common.ts' -o \
    -name 'utils.tsx' -o \
    -name 'helpers.tsx' -o \
    -name 'misc.tsx' -o \
    -name 'common.tsx' \
  \) -print 2>/dev/null || true)"

  if [[ -n "$matches" ]]; then
    echo "$matches" >&2
    echo "" >&2
    echo "FAIL: junk-drawer module names are banned (utils.ts, helpers.ts, misc.ts, common.ts)" >&2
    echo "      Name the module after the concept it owns." >&2
    echo "" >&2
    fail=1
  fi
}

if [[ ! -d src ]]; then
  echo "No src/ directory found. scripts/check-anti-sludge.sh assumes src/ layout." >&2
  exit 0
fi

check_filenames

if [[ "$fail" -ne 0 ]]; then
  echo "Anti-SLUDGE shell checks failed." >&2
  exit 1
fi

echo "Anti-SLUDGE shell checks passed."
