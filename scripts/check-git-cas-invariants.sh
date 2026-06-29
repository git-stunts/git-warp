#!/bin/bash
# check-git-cas-invariants.sh — Detect direct git storage CLI usage bypassing @git-stunts/git-cas.
#
# git-warp mandates that ALL CAS operations MUST route through @git-stunts/git-cas.
# Direct invocation of raw git storage commands (git hash-object, git cat-file, etc.)
# is strictly banned to guarantee Buzhash Content-Defined Chunking (CDC) deduplication,
# constant-memory streaming, and CAS-First memoized materialization.
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
if grep -rn --include='*.ts' -E '\bgit hash-object\b' "$SCAN_DIRS"; then
  echo ""
  echo "::error::Detected raw git hash-object invocation. All CAS writes MUST use @git-stunts/git-cas cas.writeStream()."
  EXIT_CODE=1
fi

# ─────────────────────────────────────────────────────────────
# Pattern 2: Raw object inspection — git cat-file
# Bypasses streaming decompression and chunk reassembly.
# ─────────────────────────────────────────────────────────────
if grep -rn --include='*.ts' -E '\bgit cat-file\b' "$SCAN_DIRS"; then
  echo ""
  echo "::error::Detected raw git cat-file invocation. All CAS reads MUST use @git-stunts/git-cas cas.readStream() or cas.has()."
  EXIT_CODE=1
fi

# ─────────────────────────────────────────────────────────────
# Pattern 3: Raw tree/pack manipulation — git mktree, git write-tree, git unpack-objects
# ─────────────────────────────────────────────────────────────
if grep -rn --include='*.ts' -E '\bgit mktree\b|\bgit write-tree\b|\bgit unpack-objects\b' "$SCAN_DIRS"; then
  echo ""
  echo "::error::Detected raw git tree/pack manipulation. All structural storage operations MUST route through @git-stunts/git-cas."
  EXIT_CODE=1
fi

if [ $EXIT_CODE -eq 0 ]; then
  echo "✓ No raw git storage CLI violations detected. All CAS operations cleanly encapsulated in @git-stunts/git-cas."
fi

exit $EXIT_CODE
