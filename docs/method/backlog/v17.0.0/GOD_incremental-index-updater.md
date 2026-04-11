# Slay IncrementalIndexUpdater (955 LOC)

## Current shape

Real class with 1 public method (`computeDirtyShards`) and ~25 private
methods. This is an algorithm-heavy file — the methods form a pipeline
for updating bitmap index shards incrementally after a materialization
diff.

## Natural seams

### By operation type
- Node operations: `_handleNodeAdd`, `_handleNodeRemove`,
  `_purgeNodeEdges`, `_findNodeIdByGlobal`
- Edge operations: `_handleEdgeAdd`, `_handleEdgeRemove`,
  `_addToEdgeBitmap`, `_removeFromEdgeBitmap`, `_recomputeAllBucket`
- Property operations: `_handleProps`
- Label management: `_ensureLabel`, `_loadLabels`, `_saveLabels`
- Shard I/O: `_getOrLoadMeta`, `_loadMeta`, `_flushMeta`,
  `_getOrLoadEdgeShard`, `_loadEdgeShard`, `_flushEdgeShards`

### Split strategy: 3 files

- `IndexNodeUpdater.ts` (~250 LOC) — node add/remove + purge
- `IndexEdgeUpdater.ts` (~300 LOC) — edge add/remove + bitmap ops
- `IncrementalIndexUpdater.ts` (~350 LOC) — orchestrator + shard I/O
  + property handling + label management

Each updater receives a `ShardIO` port (named, typed interface — not
a bag of functions) as a dependency.

## Risk

This is algorithmic code with bitmap-level operations. Splitting
must preserve the exact same shard mutation semantics. Needs careful
test verification via the existing index tests.
