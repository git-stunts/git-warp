---
id: PROTO_index-builder-trie-iteration
blocked_by: []
blocks:
  - PERF_trie-geometry-and-memory-profile
  - INFRA_extract-warp-adapters-package
feature: trie-state-storage
---

# Index builders consume async scan from trie-backed ORSet

## Problem

`WarpStateIndexBuilder._registerNodes()` calls
`state.nodeAlive.elements()` synchronously and
`state.edgeAlive.contains()` synchronously. With trie-backed ORSets
behind a StateSession, state access is async and iteration is an
async iterable (`scan()`). The current synchronous iteration
assumption is incompatible with out-of-core state.

## Fix

Rewrite `WarpStateIndexBuilder` and `MaterializeHelpers.buildAdjacency()`
to consume async scan/cursor iteration from StateSession:

- Replace `for (const nodeId of state.nodeAlive.elements())` with
  `for await (const nodeId of session.scanNodes())`
- Replace `state.edgeAlive.contains(key)` with
  `await session.edgeContains(key)`
- The builder methods become async

This is not optional. Async scan is the honest shape of out-of-core
state access, not a performance optimization to "maybe add later."

## Scope

**In:** Async index builder rewrite. All index tests must pass.
Async iteration consumption.

**Out:** Performance benchmarking (PERF_trie-geometry-and-memory-profile).
