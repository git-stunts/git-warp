---
id: CORE_streaming-memory-audit
blocked_by: []
blocks: []
---

# Streaming memory audit — eliminate fits-in-memory assumptions

## Summary

Audit of 2026-04-14 found 13 non-streaming anti-patterns where git-warp
assumes graph data fits in memory. The immediate crash (Think's 317MB
codex repo) is caused by `readBlob()` hitting plumbing's 10MB default
buffer limit during checkpoint loading.

## Immediate fix (unblocks Think)

`GitGraphAdapter.readBlob()` calls `stream.collect({ asString: false })`
without passing `maxBytes`. Fix: pass `maxBytes: Infinity` (or a
configurable per-adapter limit). This is a one-line fix.

Also update `CollectableStream` interface in `gitErrorClassification.ts`
to expose the `maxBytes` parameter.

## Critical patterns (crash or OOM on large repos)

| Pattern | Location | Growth |
|---------|----------|--------|
| `readBlob()` no maxBytes | GitGraphAdapter.ts:249 | O(blob) |
| `collectPatchEntriesForFrontier()` | ComparisonSelector.ts:201 | O(W*P) |
| `loadPatchRange()` unshift | syncPatchLoader.ts:141 | O(N^2) |

## High patterns (degrade at scale)

| Pattern | Location | Growth |
|---------|----------|--------|
| Checkpoint loads full state | checkpointLoad.ts:70 | O(N) |
| Index `.collect()` all shards | LogicalIndexReader.ts:138 | O(N) |
| Materialization buffers patches | MaterializeController.ts:165 | O(ops) |
| Provenance index fully in memory | ProvenanceIndex.ts:122 | O(P) |
| `readTree()` all entries | GitGraphAdapter.ts:201 | O(E) |

## Medium patterns (degrade but don't crash)

| Pattern | Location | Growth |
|---------|----------|--------|
| QueryRunner getNodes() | QueryRunner.ts:487 | O(N) |
| Comparison getNodes/getEdges | diffStructure.ts:223 | O(N+E) |
| Sync response accumulation | syncRequestResponse.ts:185 | O(M) |
| Index ID mapping | BitmapIndexReader.ts:170 | O(commits) |
| State serialization | StateSerializer.ts:66 | O(N) |

## Architectural direction

1. `readBlob()` must accept a `maxBytes` parameter — callers that know
   their blob is bounded pass a limit, others pass Infinity
2. `reduceV5()` should accept `AsyncIterable<PatchEntry>` not `Array`
3. Checkpoint deserialization needs a streaming codec path
4. `loadPatchRange()` should return `AsyncIterable` not `Array`
5. `collectPatchEntriesForFrontier()` should yield, not accumulate
6. Index loading should stay lazy (LRU cache is good) but
   `loadFromStore().collect()` should be replaced with iteration

## Priority

The one-line `readBlob()` fix is ASAP — it unblocks Think capture
on the codex repo. The rest is up-next work for v17.1+.
