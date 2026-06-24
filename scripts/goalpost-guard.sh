#!/usr/bin/env bash
# Advisory guard for the consolidated public documentation topology.
set -euo pipefail

REQUIRED_DOCS=(
  "README.md"
  "ARCHITECTURE.md"
  "CHANGELOG.md"
  "docs/topics/README.md"
  "docs/topics/getting-started.md"
  "docs/topics/optic-reads.md"
  "docs/topics/observers.md"
  "docs/topics/querying.md"
  "docs/topics/strands.md"
  "docs/topics/git-substrate.md"
  "docs/topics/content-and-cas.md"
  "docs/topics/continuum-boundary.md"
  "docs/topics/sync.md"
  "docs/topics/cli.md"
  "docs/topics/operations.md"
  "docs/topics/troubleshooting.md"
)

RETIRED_PATHS=(
  "docs/archive"
  "docs/audits"
  "docs/design"
  "docs/images"
  "docs/invariants"
  "docs/method"
  "docs/migrations"
  "docs/releases"
  "docs/specs"
  "docs/trust"
  "docs/ROADMAP"
  "docs/ROADMAP.md"
  "docs/BEARING.md"
  "docs/VISION.md"
  "docs/GLOSSARY.md"
  "docs/DOCTRINE_RUNTIME_ALIGNMENT.md"
)

FAILURES=0

require_file() {
  local path="$1"
  if [ -f "$path" ]; then
    printf '  PASS current doc %s\n' "$path"
  else
    FAILURES=$((FAILURES + 1))
    printf '  FAIL missing current doc %s\n' "$path"
  fi
}

require_absent() {
  local path="$1"
  if [ -e "$path" ]; then
    FAILURES=$((FAILURES + 1))
    printf '  FAIL retired docs path still exists %s\n' "$path"
  else
    printf '  PASS retired docs path absent %s\n' "$path"
  fi
}

for path in "${REQUIRED_DOCS[@]}"; do
  require_file "$path"
done

for path in "${RETIRED_PATHS[@]}"; do
  require_absent "$path"
done

if [ "$FAILURES" -eq 0 ]; then
  echo "goalpost-guard: public docs topology passed"
else
  echo "goalpost-guard: $FAILURES public docs topology failure(s)"
fi

exit "$FAILURES"
