#!/bin/bash
# check-git-cas-invariants.sh — Detect direct Git object writes bypassing @git-stunts/git-cas.
#
# git-warp mandates that CAS object creation route through @git-stunts/git-cas.
# Git history reads and ref operations remain owned by the history adapter.
#
# Runs as part of CI (strict-policy job) and can be run locally:
#   bash scripts/check-git-cas-invariants.sh

set -euo pipefail

EXIT_CODE=0
SCAN_DIRS="src/"

# ─────────────────────────────────────────────────────────────
# Pattern 1: Raw object hashing — git hash-object
# Bypasses Buzhash CDC chunking and streaming deduplication.
# ─────────────────────────────────────────────────────────────
if grep -rn --include='*.ts' -E "git[[:space:]]+hash-object|['\"]hash-object['\"]" "$SCAN_DIRS"; then
  echo ""
  echo "::error::Detected raw git hash-object invocation. Use @git-stunts/git-cas page or asset capabilities."
  EXIT_CODE=1
fi

# ─────────────────────────────────────────────────────────────
# Pattern 2: Raw tree/pack writes — git mktree, git write-tree, git unpack-objects
# ─────────────────────────────────────────────────────────────
if grep -rn --include='*.ts' -E "git[[:space:]]+(mktree|write-tree|unpack-objects)|['\"](mktree|write-tree|unpack-objects)['\"]" "$SCAN_DIRS"; then
  echo ""
  echo "::error::Detected raw git tree/pack manipulation. All structural storage operations MUST route through @git-stunts/git-cas."
  EXIT_CODE=1
fi

if [ $EXIT_CODE -eq 0 ]; then
  echo "✓ No raw Git object-write violations detected. CAS object creation is owned by @git-stunts/git-cas."
fi

exit $EXIT_CODE
