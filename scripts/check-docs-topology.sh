#!/usr/bin/env bash
# Advisory guard for the consolidated documentation topology.
set -euo pipefail

REQUIRED_DOCS_OUTPUT=""
if ! REQUIRED_DOCS_OUTPUT="$(node scripts/release-profile.ts required-docs)"; then
  echo "docs-topology: failed to read required docs from .continuum/release.yml" >&2
  exit 1
fi

if [ "$REQUIRED_DOCS_OUTPUT" = "" ]; then
  echo "docs-topology: release profile produced no required docs" >&2
  exit 1
fi

mapfile -t REQUIRED_DOCS <<< "$REQUIRED_DOCS_OUTPUT"

CURRENT_MIGRATION_DOCS=(
  "docs/migrations/v19/README.md"
)

RETIRED_PATHS=(
  "docs/archive"
  "docs/audits"
  "docs/design"
  "docs/images"
  "docs/invariants"
  "docs/method"
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

is_current_migration_doc() {
  local path="$1"
  for current in "${CURRENT_MIGRATION_DOCS[@]}"; do
    if [ "$path" = "$current" ]; then
      return 0
    fi
  done
  return 1
}

require_current_migration_docs() {
  local path
  for path in "${CURRENT_MIGRATION_DOCS[@]}"; do
    require_file "$path"
  done

  if [ ! -d "docs/migrations" ]; then
    return
  fi

  while IFS= read -r path; do
    if is_current_migration_doc "$path"; then
      printf '  PASS current migration doc %s\n' "$path"
    else
      FAILURES=$((FAILURES + 1))
      printf '  FAIL unmanaged migration doc %s\n' "$path"
    fi
  done < <(find docs/migrations -type f | sort)
}

for path in "${REQUIRED_DOCS[@]}"; do
  require_file "$path"
done

require_current_migration_docs

for path in "${RETIRED_PATHS[@]}"; do
  require_absent "$path"
done

if [ "$FAILURES" -eq 0 ]; then
  echo "docs-topology: documentation topology passed"
else
  echo "docs-topology: $FAILURES documentation topology failure(s)"
fi

exit "$FAILURES"
