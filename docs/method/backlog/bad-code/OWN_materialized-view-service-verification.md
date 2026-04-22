---
id: OWN_materialized-view-service-verification
blocked_by: []
blocks: []
---

# MaterializedViewService carries index verification concern

**Effort:** S

`MaterializedViewService.js` mixes build/load/persist with index
verification logic (mulberry32 PRNG, sampleNodes,
buildGroundTruthAdjacency, verifyOneNode, verifySampledNodes). The
verification concern is independent of the build/persist lifecycle.

Also contains `_shardToEntry()` P5-LEGACY code that duplicates
`IndexShardEncodeTransform._encode()` and silently swallows unknown
shard types instead of throwing.

## What's wrong

- **S concern**: Verification is a separate reason to change.
- `_shardToEntry()` silent fallback diverges from adapter behavior.

## Suggested fix

- Extract `IndexVerifier` service for sampling + cross-provider checks.
- Delete `_shardToEntry()` when `IncrementalIndexUpdater` migrates to
  `IndexStorePort` (the P5-LEGACY bridge dies with it).
