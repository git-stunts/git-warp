#!/bin/sh
# --- @git-stunts/git-warp post-merge hook __WARP_HOOK_VERSION__ ---
# warp-hook-version: __WARP_HOOK_VERSION__
#
# Post-merge hook: notify when warp refs changed during merge/pull.
# Always exits 0 — never blocks a merge.

GIT_DIR=$(git rev-parse --git-dir 2>/dev/null) || exit 0
SNAPSHOT="${GIT_DIR}/warp-ref-snapshot"

# Capture current warp refs (sorted for stable comparison)
CURRENT=$(git for-each-ref --format='%(refname) %(objectname)' --sort=refname refs/warp/ 2>/dev/null) || true

if [ -z "$CURRENT" ]; then
  # No warp refs exist — clean up any stale snapshot and exit
  rm -f "$SNAPSHOT"
  exit 0
fi

CHANGED=0

if [ -f "$SNAPSHOT" ]; then
  PREVIOUS=$(cat "$SNAPSHOT")
  if [ "$CURRENT" != "$PREVIOUS" ]; then
    CHANGED=1
  fi
else
  # First encounter — refs exist but no snapshot yet
  CHANGED=1
fi

# Save current state for next comparison
printf '%s\n' "$CURRENT" > "$SNAPSHOT"

if [ "$CHANGED" -eq 0 ]; then
  exit 0
fi

AUTO_MAT=$(git config --bool warp.autoMaterialize 2>/dev/null) || true

if [ "$AUTO_MAT" = "true" ]; then
  echo "[warp] Refs changed — auto-materializing..."
  if command -v git-warp >/dev/null 2>&1; then
    git-warp materialize || echo "[warp] Warning: auto-materialize failed."
  elif command -v warp-graph >/dev/null 2>&1; then
    warp-graph materialize || echo "[warp] Warning: auto-materialize failed."
  else
    echo "[warp] Warning: neither git-warp nor warp-graph found in PATH."
  fi
else
  echo "[warp] Writer refs changed during merge. Call materialize() to see updates."
fi

exit 0
# --- end @git-stunts/git-warp ---
