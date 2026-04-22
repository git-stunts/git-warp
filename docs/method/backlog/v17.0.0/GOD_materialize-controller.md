---
id: GOD_materialize-controller
blocks:
  - API_migrate-consumers-to-capabilities
blocked_by:
  - CROSS_shared-provider-interfaces
feature: materialization-query-index
---

# Slay MaterializeController (1009 LOC)

## Current shape

Real class with 3 public async methods, 10 private helpers, 12 free
helper functions (~290 LOC). Methods are too big and concerns are
tangled: materialization pipeline, state caching, index management,
seek cache, normalization.

## Split: 3 files

### `MaterializeHelpers.ts` (~200 LOC)

Pure functions. No host access. No ports.

```typescript
function normalizeFrontierInput(
  input: Map<string, string> | Record<string, string>,
): Map<string, string>

function normalizeExplicitCeiling(ceiling: unknown): number | null

function frontiersEqual(
  a: Map<string, string>,
  b: Map<string, string>,
): boolean

function scanFrontierForMaxLamport(
  frontier: Map<string, string>,
  readPatch: (sha: string) => Promise<{ lamport: number }>,
): Promise<number>

function scanPatchesForMaxLamport(
  patches: Array<{ patch: { lamport: number } }>,
): number

function freezePublicState(state: WarpState): WarpState
function freezePublicStateWithReceipts(
  state: WarpState,
  receipts: TickReceipt[],
): { state: WarpState; receipts: TickReceipt[] }
```

### `MaterializeCache.ts` (~200 LOC)

Seek cache + index lifecycle. Injected ports.

```typescript
class MaterializeCache {
  constructor(
    private readonly seekCache: SeekCachePort | null,
    private readonly codec: CodecPort,
    private readonly clock: ClockPort,
    private readonly logger: LoggerPort,
  ) {}

  async tryReadCoordinate(
    frontier: Map<string, string>,
    ceiling: number | null,
  ): Promise<{ state: WarpState; indexTreeOid: string } | null>

  async persistEntry(
    cacheKey: string,
    state: WarpState,
  ): Promise<void>

  async restoreIndex(indexTreeOid: string): Promise<IndexShard[] | null>

  verifyIndex(state: WarpState, index: unknown): VerifyResult
  invalidateIndex(): void
}
```

### `MaterializeController.ts` (~400 LOC)

The 3 materialization pipelines + state caching + adjacency building.
Injected deps, no host bag.

```typescript
class MaterializeController implements MaterializeCapability {
  constructor(
    private readonly persistence: CommitPort & RefPort,
    private readonly patchCollector: PatchCollector,
    private readonly cache: MaterializeCache,
    private readonly graphCloner: DetachedGraphFactory,
    private readonly stateStore: MaterializedStateStore,
    private readonly checkpointPolicy: CheckpointPolicy | null,
    private readonly clock: ClockPort,
    private readonly logger: LoggerPort,
  ) {}

  async materialize(options?: MaterializeOptions): Promise<WarpState>
  async materializeCoordinate(options: CoordinateOptions): Promise<WarpState>
  async materializeAt(checkpointSha: string): Promise<WarpState>
  verifyIndex(options?: VerifyIndexOptions): VerifyResult
  invalidateIndex(): void
}

type MaterializeOptions = {
  ceiling?: number | null;
  receipts?: boolean;
};

type CoordinateOptions = {
  frontier: Map<string, string> | Record<string, string>;
  ceiling?: number | null;
  receipts?: boolean;
};
```

`MaterializedStateStore` is an interface for the stateful cache that
currently lives as `_cachedState` / `_cachedStateHash` /
`_cachedAdjacency` on WarpRuntime:

```typescript
interface MaterializedStateStore {
  get(): { state: WarpState; stateHash: string | null; adjacency: AdjacencyMap } | null;
  set(state: WarpState, stateHash: string | null, adjacency: AdjacencyMap): void;
  clear(): void;
}
```

`PatchCollector` is an interface for collecting patches from the
frontier:

```typescript
interface PatchCollector {
  collectForFrontier(
    frontier: Map<string, string>,
    ceiling: number | null,
  ): Promise<Array<{ patch: Patch; sha: string }>>;
}
```

## Data flow

```
Consumer calls graph.materialize.snapshot()
  → MaterializeController.materialize()
    → patchCollector.collectForFrontier(frontier, ceiling)
    → reduces patches via JoinReducer (applyFast or applyWithDiff)
    → builds adjacency via _buildAdjacency(state)
    → stateStore.set(state, hash, adjacency)
    → cache.persistEntry(key, state) (async, non-blocking)
    → freezePublicState(state)
    → returns frozen state
```

## Named option types

Every public method has a named options type (see above). No
`Record<string, unknown>`. No anonymous bags.

## Test files

- `test/unit/domain/WarpGraph.autoMaterialize.test.js`
- `test/unit/domain/WarpGraph.adjacencyCache.test.js`
- `test/unit/domain/WarpGraph.autoCheckpoint.test.js`
- All WarpGraph tests that call `materialize()` / `materializeCoordinate()`

## Execution order

1. Define `MaterializedStateStore`, `PatchCollector` interfaces
2. Create `MaterializeHelpers.ts` (pure functions)
3. Create `MaterializeCache.ts` with injected ports
4. Rewrite `MaterializeController.ts` with injected deps
5. Wire in `openWarpGraph` factory (or WarpRuntime constructor for now)
