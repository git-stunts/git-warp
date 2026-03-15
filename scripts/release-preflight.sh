#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Release Preflight — local sanity check before tagging a release.
#
# Usage:  npm run release:preflight
#         bash scripts/release-preflight.sh
#
# Exits 0 if all checks pass, 1 if any hard check fails.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; EXIT=1; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }

EXIT=0

echo ""
echo -e "${BOLD}═══ Release Preflight ═══${NC}"
echo ""

# ── 1. Version agreement ─────────────────────────────────────────────────────
PKG=$(node -p "require('./package.json').version")
JSR=$(node -p "require('./jsr.json').version")
echo "Versions:"
if [ "$PKG" = "$JSR" ]; then
  pass "package.json ($PKG) == jsr.json ($JSR)"
else
  fail "package.json ($PKG) != jsr.json ($JSR)"
fi

# ── 2. Clean working tree ────────────────────────────────────────────────────
echo "Working tree:"
if git diff --quiet && git diff --cached --quiet; then
  pass "clean (no uncommitted changes)"
else
  fail "dirty working tree — commit or stash first"
fi

# ── 3. Branch ─────────────────────────────────────────────────────────────────
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "Branch:"
if [ "$BRANCH" = "main" ]; then
  pass "on main"
else
  warn "on '$BRANCH' (expected main)"
fi

# ── 4. CHANGELOG has a dated entry for this version ──────────────────────────
echo "CHANGELOG:"
if grep -qE "^\#*\s*\[?${PKG}\]?\s*[—–-]\s*[0-9]{4}-[0-9]{2}-[0-9]{2}" CHANGELOG.md; then
  pass "found dated entry for $PKG"
else
  fail "no dated entry for $PKG in CHANGELOG.md"
fi

# ── 5. README "What's New" section ───────────────────────────────────────────
echo "README:"
if grep -qiE "what.s new.*(in|for)?\s*v?${PKG}" README.md; then
  pass "README mentions What's New for v$PKG"
else
  fail "README 'What's New' section not updated for v$PKG"
fi

# ── 6. Lint ───────────────────────────────────────────────────────────────────
echo "Lint:"
if npm run lint --silent 2>/dev/null; then
  pass "ESLint clean"
else
  fail "ESLint errors"
fi

# ── 7. Type firewall ─────────────────────────────────────────────────────────
echo "Type firewall:"
if npm run typecheck --silent 2>/dev/null; then
  pass "tsc --noEmit"
else
  fail "TypeScript errors"
fi
if npm run typecheck:policy --silent 2>/dev/null; then
  pass "IRONCLAD policy"
else
  fail "Policy violations"
fi
if npm run typecheck:consumer --silent 2>/dev/null; then
  pass "Consumer type surface"
else
  fail "Consumer type test failed"
fi
if npm run typecheck:surface --silent 2>/dev/null; then
  pass "Declaration surface"
else
  fail "Declaration surface mismatch"
fi

# ── 8. Unit tests ────────────────────────────────────────────────────────────
echo "Tests:"
if npm run test:local --silent 2>/dev/null; then
  pass "unit tests"
else
  fail "unit test failures"
fi

# ── 9. Pack dry-runs ─────────────────────────────────────────────────────────
echo "Pack:"
PACK_OUTPUT=$(npm pack --dry-run 2>&1 || true)
if printf '%s\n' "$PACK_OUTPUT" | grep -q "total files"; then
  pass "npm pack dry-run"
else
  fail "npm pack dry-run failed"
fi
if npx -y jsr publish --dry-run --allow-dirty 2>/dev/null; then
  pass "JSR publish dry-run"
else
  fail "JSR publish dry-run failed"
fi

# ── 10. Security audit (warning only) ────────────────────────────────────────
echo "Security:"
if npm audit --omit=dev --audit-level=high 2>/dev/null; then
  pass "no high/critical vulnerabilities"
else
  warn "npm audit found issues (non-blocking)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
if [ "$EXIT" -eq 0 ]; then
  echo -e "${GREEN}All preflight checks passed.${NC}"
  echo ""
  echo "Ready to tag:"
  echo "  git tag -s v${PKG} -m 'release: v${PKG}'"
  echo "  git push origin v${PKG}"
else
  echo -e "${RED}Preflight failed. Fix the issues above before tagging.${NC}"
fi
echo ""
exit $EXIT
