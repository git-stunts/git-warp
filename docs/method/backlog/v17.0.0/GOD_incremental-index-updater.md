# Slay IncrementalIndexUpdater (955 LOC)

## Current shape

Real class with 1 public method (`computeDirtyShards`) and ~25 private
methods. Algorithm-heavy — updates bitmap index shards incrementally
after a materialization diff.

## Boundary violation

`loadShard: (path: string) => Uint8Array | undefined` passes raw bytes
into the domain. Every method decodes them inline. The flush methods
encode typed objects back to `Uint8Array`. This is serialization inside
the domain — violates SSTS P5.

## The fix: ShardPort

```typescript
interface ShardPort {
  loadMeta(shardKey: string): MetaShard | null;
  loadEdgeShard(dir: 'fwd' | 'rev', shardKey: string): EdgeShard | null;
  loadLabels(): LabelMap | null;
  saveMeta(shardKey: string, shard: MetaShard): void;
  saveEdgeShard(dir: 'fwd' | 'rev', shardKey: string, shard: EdgeShard): void;
  saveLabels(labels: LabelMap): void;
}
```

The domain works with typed shard objects. The port adapter owns
`Uint8Array` ↔ typed object conversion. The current `_loadMeta`,
`_flushMeta`, `_loadEdgeShard`, `_flushEdgeShards`, `_loadLabels`,
`_saveLabels` methods become the port adapter, not domain code.

## Domain types

```typescript
type MetaShard = {
  readonly nodeToGlobal: Array<[string, number]>;
  nextLocalId: number;
  aliveBitmap: RoaringBitmapSubset;
  globalToNode: Map<number, string>;
  nodeToGlobalMap: Map<string, number>;
};

type EdgeShard = Record<string, Record<string, Uint8Array>>;
// Keyed by bucket ("all" | labelId), then globalId → serialized bitmap.
// Uint8Array here is bitmap wire format — roaring handles it, not us.

type LabelMap = Record<string, number>;
```

## Split strategy: 3 files

### `ShardPort.ts` (~30 LOC, in `src/ports/`)
The interface above. One file, one port.

### `IndexNodeUpdater.ts` (~250 LOC)
```typescript
class IndexNodeUpdater {
  constructor(private readonly shards: ShardPort) {}

  handleNodeAdd(nodeId: string, metaCache: Map<string, MetaShard>): void
  handleNodeRemove(nodeId: string, metaCache: Map<string, MetaShard>): void
  purgeNodeEdges(
    deadNodeId: string,
    metaCache: Map<string, MetaShard>,
    fwdCache: Map<string, EdgeShard>,
    revCache: Map<string, EdgeShard>,
    labels: LabelMap,
  ): void
  findGlobalId(meta: MetaShard, nodeId: string): number | undefined
}
```

### `IndexEdgeUpdater.ts` (~300 LOC)
```typescript
class IndexEdgeUpdater {
  constructor(private readonly shards: ShardPort) {}

  handleEdgeAdd(
    edge: { from: string; to: string; label: string },
    labels: LabelMap,
    metaCache: Map<string, MetaShard>,
    fwdCache: Map<string, EdgeShard>,
    revCache: Map<string, EdgeShard>,
  ): void

  handleEdgeRemove(
    edge: { from: string; to: string; label: string },
    labels: LabelMap,
    metaCache: Map<string, MetaShard>,
    fwdCache: Map<string, EdgeShard>,
    revCache: Map<string, EdgeShard>,
  ): void

  // Private: addToEdgeBitmap, removeFromEdgeBitmap, recomputeAllBucket
}
```

### `IncrementalIndexUpdater.ts` (~350 LOC)
```typescript
class IncrementalIndexUpdater {
  constructor(private readonly shards: ShardPort) {}

  computeDirtyShards(params: {
    diff: PatchDiff;
    state: WarpState;
  }): Map<string, MetaShard | EdgeShard | LabelMap>
  // Returns typed shard objects. The caller (or port adapter)
  // serializes them back to Uint8Array for storage.

  // Private: collectDirtyShardKeys, handleProps, ensureLabel
}
```

## Data flow

```
MaterializeController calls computeDirtyShards({ diff, state })
  → orchestrator loads shards via ShardPort (typed objects)
  → creates metaCache, fwdCache, revCache (Maps of typed objects)
  → delegates to IndexNodeUpdater.handleNodeAdd/Remove (mutates caches)
  → delegates to IndexEdgeUpdater.handleEdgeAdd/Remove (mutates caches)
  → handles property changes inline
  → returns dirty shard objects
  → caller passes dirty objects to ShardPort.save*() for encoding
```

## Test files

- `test/unit/domain/services/index/IncrementalIndexUpdater.test.js`
- `test/unit/domain/services/index/IncrementalIndexUpdater.edgeIndex.test.js`

Tests currently construct a `loadShard` function. After the split,
tests construct a mock `ShardPort` instead.

## Execution order

1. Create `ShardPort.ts` in `src/ports/`
2. Create `IndexNodeUpdater.ts` with typed signatures
3. Create `IndexEdgeUpdater.ts` with typed signatures
4. Rewrite `IncrementalIndexUpdater.ts` as orchestrator
5. Move serde logic into `ShardPort` adapter implementation
6. Update tests to mock `ShardPort`
