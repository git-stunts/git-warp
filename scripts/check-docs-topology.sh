#!/usr/bin/env bash
# Advisory guard for the consolidated documentation topology.
set -euo pipefail

mapfile -t REQUIRED_DOCS < <(node scripts/release-profile.ts required-docs)

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
  echo "docs-topology: documentation topology passed"
else
  echo "docs-topology: $FAILURES documentation topology failure(s)"
fi

exit "$FAILURES"
