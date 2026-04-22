---
id: PROTO_materialize-integration
feature: materialization-query-index
blocked_by: []
blocks:
  - PROTO_index-builder-trie-iteration
  - PERF_trie-geometry-and-memory-profile
  - INFRA_extract-warp-kernel-package
  - PROTO_materialize-strategy-decomposition
---

# Wire MaterializeController to StateSession and unified snapshot publication

## Problem

MaterializeController orchestrates checkpoint load -> patch replay ->
final state. It currently works with in-memory ORSets. It must now
operate through StateSession for trie-backed state and use the
unified snapshot/checkpoint substrate for persistence.

## Fix

Update MaterializeController:

1. `_fromCheckpoint()` opens a StateSession, loads trie state from
   the pinned snapshot substrate, replays patches through the session-aware
   reducer, and closes the session
2. `_fromScratch()` opens a StateSession with empty trie, replays
   all patches, closes the session
3. Snapshot / checkpoint creation uses the unified publication path
   instead of maintaining separate checkpoint and seek-cache formats
4. If a caller points runtime code at a legacy v5 checkpoint
   (`state.cbor` blob substrate), runtime fails fast with an explicit
   upgrade-required error. Legacy import happens offline through
   `scripts/migrations/v17.0.0/migrate.ts`.

## Scope

**In:** MaterializeController session integration. Unified snapshot
publication. Current-substrate runtime reads only. All
materialization tests for the supported substrate must pass.

**Out:** Index builder changes (PROTO_index-builder-trie-iteration).
Performance validation (PERF_trie-geometry-and-memory-profile).
Legacy checkpoint fallback in shipped runtime.

## Existing v17 links

- GOD_materialize-controller — the god kill decomposed
  MaterializeController into smaller pieces. This item works with
  whatever shape the controller has after that decomposition.
- INFRA_substrate-upgrade-tool — legacy checkpoint and state import live
  in the offline upgrader, not in MaterializeController.
