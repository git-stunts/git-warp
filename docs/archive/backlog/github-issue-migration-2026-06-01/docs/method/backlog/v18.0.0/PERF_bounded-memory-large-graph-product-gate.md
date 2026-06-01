---
id: PERF_bounded-memory-large-graph-product-gate
blocked_by:
  - API_no-full-materialization-first-use-optics
blocks:
  - API_optics-public-api-closeout
  - RELEASE_v18-public-release-blockers
feature: graph-model-substrate
---

# Bounded-memory large-graph product gate

## Why

V18 is blocked until git-warp can honestly operate on graphs larger than the
memory footprint git-warp is allowed to use. The release cannot rely on full
graph state, full indexes, full patch arrays, full snapshots, or full result
arrays fitting in process memory.

This is now a v18 release gate, not a later aspiration. The Optics honesty gate
removes the immediate first-use materialization footgun; this gate proves the
broader product invariant:

```text
normal public reads, writes, content lookup, and sync must run through bounded
providers under an explicit git-warp memory budget
```

## Done Looks Like

- `WarpMemoryPool` or an equivalent memory-budget contract exists with leases,
  bounded buffers, bounded shard caches, chunk policy, budget errors, and
  observable metrics.
- A conformance fixture creates or opens a graph larger than a reasonable fixed
  git-warp memory pool and exercises the public first-use API without full
  residency.
- Blessed public paths fail tests if they call `materialize()`,
  `_materializeGraph()`, full snapshot creation, full node/edge array
  construction, observer snapshot cloning, or unbounded result collection.
- Patch history can be consumed through a bounded patch-stream substrate with
  controlled decode windows.
- Read-basis and index construction are stream-built or shard-built rather than
  derived from a full in-memory `WarpState`.
- Sharded fact indexes cover node liveness, edge endpoints, properties, content
  references, observed dots, and provenance needed by public reads and writes.
- Existing-entity writes use targeted fact resolvers instead of `_cachedState`
  or equivalent full-state access.
- Public reads expose bounded, streaming, or cursor contracts. Array-producing
  helpers require explicit limits or are classified as diagnostic, offline, or
  legacy.
- Query APIs have budget enforcement and explain their cost path, including
  exact-id, prefix/index, tail scan, missing index, and rejected full-scan cases.
- Content reads perform bounded content-reference lookup before streaming bytes;
  byte streaming alone is not enough.
- Sync uses cursors or batches at the protocol boundary and does not accumulate
  an unbounded `patches` array before returning.
- `worldline.capabilities()` or equivalent capability reporting makes bounded,
  streaming, cursor, transitional, diagnostic, offline, and legacy surfaces
  inspectable.
- Operator tooling can run a memory-budget doctor or equivalent report that
  identifies unsafe public paths and missing bases or indexes.
- Bounded mode rejects legacy full-residency APIs unless the caller explicitly
  opts into diagnostic or offline full-residency behavior.

## Non-Goals

- Native Continuum witnesshood.
- Echo scheduler parity.
- Distributed braid or plural-site semantics beyond what the v18 large-graph
  conformance needs.
- Making every global graph question cheap. Global questions may remain
  expensive, but their memory strategy must be explicit and bounded.

## Starting Points

- [Design](../../../design/0267-v18-bounded-memory-large-graph-product-gate/v18-bounded-memory-large-graph-product-gate.md)
- [WarpWorldline.ts](../../../../src/domain/WarpWorldline.ts)
- [WarpGraph.ts](../../../../src/domain/WarpGraph.ts)
- [SyncController tests](../../../../test/unit/domain/services/SyncController.test.ts)
- [v20 streaming backlog note](../v20.0.0/PERF_end-to-end-graph-streaming.md)
- [out-of-core materialization backlog note](../PERF_out-of-core-materialization.md)
