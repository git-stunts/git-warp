#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Release Preflight — local sanity check before release prep or tagging.
#
# Usage:  npm run release:prep
#         npm run release:preflight
#         bash scripts/release-preflight.sh --stage final-local --tag v18.1.1
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
STAGE="final-local"
TAG=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --stage)
      if [ "$#" -lt 2 ]; then
        echo "release-preflight: --stage requires a value" >&2
        exit 2
      fi
      STAGE="$2"
      shift 2
      ;;
    --tag)
      if [ "$#" -lt 2 ]; then
        echo "release-preflight: --tag requires a value" >&2
        exit 2
      fi
      TAG="$2"
      shift 2
      ;;
    *)
      echo "release-preflight: unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

case "$STAGE" in
  prep-pr | final-local) ;;
  *)
    echo "release-preflight: invalid stage: $STAGE" >&2
    exit 2
    ;;
esac

echo ""
echo -e "${BOLD}═══ Release Preflight ═══${NC}"
echo "Stage: $STAGE"
echo ""

# ── 1. Version agreement ─────────────────────────────────────────────────────
PKG=$(node -p "require('./package.json').version")
JSR=$(node -p "require('./jsr.json').version")
if [ "$TAG" = "" ]; then
  TAG="v${PKG}"
fi
echo "Versions:"
if [ "$PKG" = "$JSR" ]; then
  pass "package.json ($PKG) == jsr.json ($JSR)"
else
  fail "package.json ($PKG) != jsr.json ($JSR)"
fi

# ── 1b. Release policy guard ─────────────────────────────────────────────────
echo "Release policy:"
if bash scripts/release-guard.sh --stage "$STAGE" --tag "$TAG"; then
  pass "release guard"
else
  fail "release guard failed"
fi

# ── 2. Clean working tree ────────────────────────────────────────────────────
echo "Working tree:"
WORKTREE_STATUS="$(git status --porcelain)"
if [ "$WORKTREE_STATUS" = "" ]; then
  pass "clean (no uncommitted changes)"
else
  printf '%s\n' "$WORKTREE_STATUS"
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

# ── 5. Lint ───────────────────────────────────────────────────────────────────
echo "Lint:"
if npm run lint --silent 2>/dev/null; then
  pass "ESLint clean"
else
  fail "ESLint errors"
fi
if npm run lint:md --silent 2>/dev/null; then
  pass "Markdown clean"
else
  fail "Markdown lint errors"
fi
if npm run lint:md:code --silent 2>/dev/null; then
  pass "Markdown code samples clean"
else
  fail "Markdown code sample errors"
fi
if command -v lychee >/dev/null 2>&1; then
  if npm run lint:links; then
    pass "Documentation links clean"
  else
    fail "Documentation link errors"
  fi
elif [ "${WARP_LINKCHECK_EXTERNAL_OK:-}" = "1" ]; then
  pass "Documentation links clean (external gate)"
else
  fail "Documentation link checker unavailable"
fi

# ── 6. Type firewall ─────────────────────────────────────────────────────────
echo "Type firewall:"
if npm run typecheck:src --silent 2>/dev/null; then
  pass "tsc --noEmit (source)"
else
  fail "tsc produced errors"
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

# ── 7. Coverage tests ────────────────────────────────────────────────────────
echo "Tests:"
# Do not pass npm --silent here. It leaks npm loglevel settings into child npm
# subprocesses spawned by release artifact tests and suppresses npm pack output.
if npm run test:coverage:ci 2>/dev/null; then
  pass "coverage test suite + threshold"
else
  fail "coverage test suite or threshold failures"
fi

# ── 8. Pack dry-runs ─────────────────────────────────────────────────────────
echo "Pack:"
PACK_OUTPUT=$(npm pack --dry-run 2>&1 || true)
if printf '%s\n' "$PACK_OUTPUT" | grep -q "total files"; then
  pass "npm pack dry-run"
else
  fail "npm pack dry-run failed"
fi
if bash scripts/smoke-packed-artifact.sh; then
  pass "packed artifact smoke"
else
  fail "packed artifact smoke failed"
fi
if npx -y jsr publish --dry-run --allow-dirty 2>/dev/null; then
  pass "JSR publish dry-run"
else
  fail "JSR publish dry-run failed"
fi

# ── 9. Security audit ────────────────────────────────────────────────────────
echo "Security:"
if npm audit --omit=dev --audit-level=high 2>/dev/null; then
  pass "no high/critical vulnerabilities"
else
  fail "npm audit found high/critical runtime vulnerabilities"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
if [ "$EXIT" -eq 0 ]; then
  echo -e "${GREEN}All preflight checks passed.${NC}"
  echo ""
  if [ "$STAGE" = "prep-pr" ]; then
    echo "Ready to push the release-prep branch and open a PR."
  else
    echo "Ready for Release Autotag to create:"
    echo "  v${PKG}"
    echo ""
    echo "After the tag exists, manually dispatch registry publication as a JSR @git-stunts scope member:"
    echo "  gh workflow run release.yml --ref main -f tag=v${PKG}"
    echo ""
    echo "Manual fallback, if autotag cannot run:"
    echo "  git tag -a v${PKG} -m 'release: v${PKG}'"
    echo "  git push origin v${PKG}"
  fi
else
  echo -e "${RED}Preflight failed. Fix the issues above before continuing.${NC}"
fi
echo ""
exit $EXIT
