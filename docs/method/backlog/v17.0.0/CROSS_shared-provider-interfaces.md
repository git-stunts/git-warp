---
id: CROSS_shared-provider-interfaces
blocks:
  - GOD_query-controller
  - GOD_materialize-controller
  - GOD_incremental-index-updater
  - GOD_remaining-big-files
  - SLUDGE_host-bag-injection
  - SLUDGE_detached-graph-duplication
blocked_by: []
---

# Define shared provider interfaces

Multiple god kill plans reference the same injected dependency
interfaces. These must be defined ONCE, BEFORE any god is slain,
so all consumers share the same contract.

## Interfaces to create

### `src/ports/ShardPort.ts`
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
Used by: IncrementalIndexUpdater, StreamingBitmapIndexBuilder.

### `src/domain/capabilities/MaterializedStateProvider.ts`
```typescript
interface MaterializedStateProvider {
  current(): WarpState | null;
  stateHash(): string | null;
}
```
Used by: QueryController (reads), QueryContent (content access).

### `src/domain/capabilities/MaterializedStateStore.ts`
```typescript
interface MaterializedStateStore {
  get(): { state: WarpState; stateHash: string | null; adjacency: AdjacencyMap } | null;
  set(state: WarpState, stateHash: string | null, adjacency: AdjacencyMap): void;
  clear(): void;
}
```
Used by: MaterializeController.

### `src/domain/capabilities/PatchCollector.ts`
```typescript
interface PatchCollector {
  collectForFrontier(
    frontier: Map<string, string>,
    ceiling: number | null,
  ): Promise<Array<{ patch: Patch; sha: string }>>;
}
```
Used by: MaterializeController.

### `src/domain/capabilities/IndexProvider.ts`
```typescript
interface IndexProvider {
  neighborsOf(
    nodeId: string,
    direction: Direction,
    opts?: { labels?: Set<string> },
  ): NeighborResult[];
}
```
Used by: QueryReads.

### `src/domain/capabilities/DetachedGraphFactory.ts`
```typescript
interface DetachedGraphFactory {
  openReadOnly(): Promise<WarpGraph>;
}
```
Used by: QueryController (observer), MaterializeController
(coordinate materialize), Worldline.

Replaces 3 duplicated `openDetachedReadGraph` / `openDetachedObserverGraph`
functions. See `SLUDGE_detached-graph-duplication.md`.

## Execution

Create all 6 interface files. No implementations yet — the existing
code continues to work. Implementations come during each god kill.
