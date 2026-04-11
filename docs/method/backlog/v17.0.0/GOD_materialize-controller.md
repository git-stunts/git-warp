# Slay MaterializeController (1009 LOC)

## Current shape

Real class (not defineProperty sludge) with 3 public async methods
and 10 private helpers, plus 12 free helper functions at the top
(~290 LOC). Unlike QueryController, this is a proper class — the
methods are just too big and the concerns are tangled.

## Public methods

- `materialize(options)` — full materialization (the big one, ~160 LOC)
- `materializeCoordinate(options)` — coordinate/ceiling materialization
- `materializeAt(checkpointSha)` — materialize from checkpoint
- `verifyIndex(options)` — index verification
- `invalidateIndex()` — index invalidation

## Private methods

- `_materializeGraph()` — internal state + adjacency snapshot
- `_resolveCeiling(options)` — ceiling normalization
- `_buildAdjacency(state)` — adjacency map construction
- `_setMaterializedState(state, optionsOrDiff)` — state caching + index update
- `_buildView(state, stateHash, diff)` — view construction for subscribers
- `_materializeWithCeiling(ceiling, collectReceipts, t0)` — ceiling pipeline
- `_materializeWithCoordinate(frontier, ceiling, collectReceipts, t0)` — coordinate pipeline
- `_persistSeekCacheEntry(cacheKey, buf, state)` — seek cache persistence
- `_restoreIndexFromCache(indexTreeOid)` — index restore from cache

## Free helper functions (~290 LOC)

- `scanFrontierForMaxLamport(host, frontier)` — frontier lamport scan
- `scanPatchesForMaxLamport(host, patches)` — patch lamport scan
- `freezePublicState(state)` — freeze for public return
- `freezePublicStateWithReceipts(state, receipts)` — freeze with receipts
- `_maybeAutoCheckpoint(host, patchCount)` — auto-checkpoint logic
- `openDetachedReadGraph(host)` — detached graph clone
- `normalizeFrontierInput(frontierInput)` — frontier normalization
- `normalizeExplicitCeiling(ceiling)` — ceiling validation
- `frontiersEqual(a, b)` — frontier comparison
- `tryReadCoordinateCache(host, frontier, ceiling, t0)` — seek cache lookup
- `collectPatchesForFrontier(host, frontier, ceiling)` — patch collection

## Natural seams

### 1. Materialization pipeline (~400 LOC)
The core: `materialize()`, `materializeCoordinate()`, `materializeAt()`.
These are the 3 entry points. Each collects patches, reduces them,
builds adjacency, caches state, and optionally collects receipts.

### 2. State management (~200 LOC)
`_setMaterializedState()`, `_buildView()`, `_buildAdjacency()`,
freeze helpers. Owns the transition from reduced CRDT state to the
cached, frozen, subscriber-notifiable form.

### 3. Index/cache (~200 LOC)
`_persistSeekCacheEntry()`, `_restoreIndexFromCache()`,
`tryReadCoordinateCache()`, `verifyIndex()`, `invalidateIndex()`.
Seek cache and bitmap index lifecycle.

### 4. Normalization/helpers (~200 LOC)
Free functions: frontier normalization, ceiling validation, lamport
scanning, detached graph cloning, frontier comparison.

## Split strategy

### 3 files

- `MaterializeCache.ts` (~200 LOC) — seek cache persistence, index
  restore, coordinate cache lookup, index verify/invalidate.
  Injected deps: `SeekCachePort`, `IndexStore`.
- `MaterializeHelpers.ts` (~200 LOC) — frontier normalization, ceiling
  validation, lamport scanning, frontier comparison, freeze helpers.
  Pure functions, no host access.
- `MaterializeController.ts` (~400 LOC) — the 3 materialization
  pipelines (live, coordinate, checkpoint) + state caching +
  adjacency building + subscriber notification. Composes cache +
  helpers. Injected deps: `StateCache`, `PatchCollector`, `ClockPort`,
  `LoggerPort`. No `_host` bag.

## Dependencies on WarpRuntime internals

Via `this._host`:
- `_cachedState` / `_cachedStateHash` / `_cachedStateLamport`
- `_cachedAdjacency` / `_cachedIndex` / `_adjacencyCacheSize`
- `_seekCache` / `_persistence` / `_crypto` / `_codec`
- `_graphName` / `_writerId` / `_clock` / `_logger`
- `_gcPolicy` / `_checkpointPolicy`
- `_materializeController` (self-reference for detached cloning)
- `_subscribers` (notification)
- `_provenanceDegraded` flag

This is the most coupled controller.

## Sludge that MUST die during this split

1. **No `_host` bag, no "MaterializeContext" bag.** Inject specific
   deps: `StateCache`, `SeekCachePort`, `IndexStore`, `PatchCollector`,
   `ClockPort`, `LoggerPort`. See `SLUDGE_host-bag-injection.md`.

2. **`openDetachedReadGraph` → shared `DetachedGraphFactory`.**
   See `SLUDGE_detached-graph-duplication.md`.

3. **`_maybeAutoCheckpoint` reaches into host for checkpoint policy.**
   Should receive the policy as a constructor dep, not reach through
   host.

## SSTS amendments

- **Named options types** for `materialize(options)` and
  `materializeCoordinate(options)`. No anonymous bags.
- **Cache encoding through CodecPort.** `_persistSeekCacheEntry`
  must use the injected codec, not inline encoding.
- **Named result types** for materialization results.
