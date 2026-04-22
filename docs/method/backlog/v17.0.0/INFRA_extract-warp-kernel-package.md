---
id: INFRA_extract-warp-kernel-package
blocked_by:
  - PROTO_materialize-integration
  - PERF_trie-geometry-and-memory-profile
blocks:
  - INFRA_extract-warp-adapters-package
feature: runtime-boundaries
---

# Extract engine into packages/warp-kernel once ORSet and materialization seams are real

## Problem

The domain services (JoinReducer, WarpState, MaterializeController,
executeGC, Op hierarchy, CheckpointSerializer) currently live in
`src/domain/`. Once the ORSet seam and materialization session boundary
are proven, these can be extracted into their own package with a clean
dependency on `warp-orset`.

## Fix

Move domain services, state management, and controllers into
`packages/warp-kernel/src/`. Wire up the `warp-orset` dependency.
Update all import paths. Verify all tests pass.

## Scope

**In:** Code move. Import rewrites. Test verification. Package boundary
definition.

**Out:** This is deliberately late. Do not extract before the ORSet
line proves its seams.

## Existing v17 links

- API_kill-warpruntime — the devil dies when consumers migrate to
  openWarpGraph(). Kernel extraction should happen after or alongside
  this kill.
- API_warpgraph-factory — the factory that replaces WarpRuntime.
  Kernel extraction must preserve the factory's wiring.
