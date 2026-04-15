---
id: PROTO_index-builder-trie-iteration
blocked_by:
  - PROTO_materialize-integration
blocks:
  - PERF_trie-geometry-and-memory-profile
  - INFRA_extract-warp-adapters-package
---

# Index builders tolerate trie-backed ORSet iteration

## Problem

`WarpStateIndexBuilder._registerNodes()` calls
`state.nodeAlive.elements()` and `state.edgeAlive.contains()`. With
trie-backed ORSets, `elements()` does a full trie scan. The index
builder must work correctly with this and handle any performance
implications.

## Fix

Verify that `WarpStateIndexBuilder` and `MaterializeHelpers.buildAdjacency()`
work correctly with `ShadowTrieORSet`. If full-scan performance through
`elements()` is unacceptable, add an async streaming alternative and
update the index builder to consume it.

## Scope

**In:** Index builder verification. Performance assessment.
Streaming alternative if needed. All index tests must pass.

**Out:** Performance benchmarking (PERF_trie-geometry-and-memory-profile).
