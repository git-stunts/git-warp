#!/bin/sh
# ═══════════════════════════════════════════════════════════════════════════
# LINT RATCHET — Zero-tolerance error ceiling enforcement
#
# This script asserts that ESLint reports EXACTLY zero errors across the
# entire codebase. It's the nuclear option: if even one error exists, it
# fails. No ceiling file, no threshold — just zero.
#
# Used by:
#   - pre-push hook (Gate 4 already runs `npm run lint`)
#   - CI type-firewall job (Gate 4)
#
# This script exists as an explicit, auditable assertion that the
# zero-error invariant holds. It's separate from `npm run lint` so
# it can be run standalone and so the intent is unambiguous.
# ═══════════════════════════════════════════════════════════════════════════
set -e

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$ROOT" ]; then
  echo "lint-ratchet: unable to locate repo root" >&2
  exit 1
fi
cd "$ROOT"

echo "[RATCHET] Running full ESLint scan..."
ERROR_COUNT=$(npx eslint . --format json 2>/dev/null | node -e "
  const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  const total = data.reduce((sum, f) => sum + f.errorCount, 0);
  process.stdout.write(String(total));
")

if [ "$ERROR_COUNT" != "0" ]; then
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "  RATCHET FAILED: $ERROR_COUNT lint error(s) detected"
  echo ""
  echo "  The codebase must have ZERO ESLint errors."
  echo "  Run 'npx eslint .' to see them, fix them, try again."
  echo "════════════════════════════════════════════════════════════"
  echo ""
  # Show the actual errors for fast diagnosis
  npx eslint .
  exit 1
fi

echo "[RATCHET] Zero errors confirmed. Invariant holds."
