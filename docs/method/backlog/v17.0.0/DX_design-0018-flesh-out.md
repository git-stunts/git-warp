---
id: DX_design-0018-flesh-out
blocked_by: []
blocks:
  - DX_v17-lane-readme-update
  - PROTO_git-trie-store-port
  - PROTO_checkpoint-envelope-publication
---

# Flesh out Design 0018 with final Shadow-Trie decisions

## Problem

Design 0018 (Shadow-Trie ORSet + workspace reorg) was approved in
conversation but the design doc is a stub. The locked architectural
decisions exist only in conversation history and think captures.

## Fix

Expand `docs/design/0018-shadow-trie-orset/shadow-trie-orset.md` to
record all 8 locked decisions, the package extraction order, the
checkpoint publication model, and the backlog mapping.

## Scope

**In:** Design doc content only. The 8 locked decisions:

1. Core trie state uses native Git objects (branches = trees, leaves = blobs)
2. Route keys are binary blake3(elementId)
3. First cut replaces nodeAlive and edgeAlive only
4. StateSession is the async firewall
5. Checkpoint truth is checkpoint ref -> checkpoint commit -> envelope tree
6. Patch envelopes are native Git trees, not trailer-OID reachability
7. Workspace scaffolding uses npm workspaces
8. Package extraction order: warp-orset early, warp-kernel later,
   warp-adapters later

**Out:** No source changes. No new design doc files.
