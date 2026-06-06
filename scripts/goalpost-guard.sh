#!/usr/bin/env bash
# Advisory guard for roadmap goalpost documents.
set -euo pipefail

REQUIRED_TERMS=(
  "Goalpost id"
  "Slice Budget"
  "Proof Stories"
  "Acceptance Criteria"
  "Deterministic Evidence"
  "Release Gate Impact"
)

FAILURES=0
FOUND=0

check_goalpost_doc() {
  local path="$1"
  local missing=0
  FOUND=$((FOUND + 1))

  for term in "${REQUIRED_TERMS[@]}"; do
    if ! grep -qF "$term" "$path"; then
      printf '  FAIL %s missing "%s"\n' "$path" "$term"
      missing=$((missing + 1))
    fi
  done

  if [ "$missing" -eq 0 ]; then
    printf '  PASS %s\n' "$path"
  else
    FAILURES=$((FAILURES + 1))
  fi
}

while IFS= read -r path; do
  [ "$path" = "" ] && continue
  if grep -qF "Goalpost id" "$path"; then
    check_goalpost_doc "$path"
  fi
done < <(find docs/design docs/method -type f -name '*.md' | sort)

if [ "$FOUND" -eq 0 ]; then
  echo "goalpost-guard: no goalpost docs found"
fi

if [ "$FAILURES" -eq 0 ]; then
  echo "goalpost-guard: all goalpost docs passed"
else
  echo "goalpost-guard: $FAILURES goalpost doc(s) failed"
fi

exit "$FAILURES"
