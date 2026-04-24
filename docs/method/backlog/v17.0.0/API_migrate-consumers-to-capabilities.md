---
id: API_migrate-consumers-to-capabilities
blocks:
  - API_kill-warpruntime
blocked_by: []
feature: api-capabilities
---

# Migrate internal consumers from WarpRuntime to capabilities

Every internal file that imports `WarpRuntime` and calls methods on it
needs to accept capability interfaces instead. This is where the tight
coupling breaks.

Key consumers:
- `Worldline.ts` — uses query + materialize capabilities
- `Observer.ts` — still needs a narrow live backing instead of `WarpRuntime`
- `QueryController.ts` — still owns detached/runtime migration residue
- `ComparisonSelector.ts` — uses materialize + sync capabilities
- CLI commands — use various capabilities
- Test helpers — `warpGraphTestUtils.ts`

Each consumer should accept the narrowest capability it needs, not the
full WarpGraph. This is the hexagonal architecture payoff.

## 0059 public seam tranche

Cycle `0059` began this migration at the public factory and sync seam:

- `openWarpGraph()` now binds frozen capability bags without
  `as unknown as`
- `WarpGraph` no longer exposes `_runtime`
- direct sync now accepts the public capability bag
  (`graph.sync.syncWith(peerGraph)`)
- the API reference no longer teaches `graphB._runtime`

That means this note is no longer blocked on `API_warpgraph-factory`. The
remaining work is the internal consumer tail:

- `Observer` / `LogicalTraversal` runtime coupling
- `QueryController` and detached graph runtime coupling
- `WarpApp` / `WarpCore` bridge residue
- other internal files that still name `WarpRuntime` where a narrower
  capability should exist instead

## 0060 observer seam tranche

Cycle `0060` moved the observer/traversal seam off `WarpRuntime`:

- `Observer.ts` now depends on an explicit `ObserverBacking` contract
  instead of importing `WarpRuntime`
- traversal is now constructed directly from the observer seam instead of
  `this as unknown as WarpRuntime`
- the touched observer path no longer carries the stale `StateReader.js`
  import

That removes the smallest internal read-side lie without smearing into
detached graph migration. The remaining work is now:

- `QueryController` and detached graph runtime coupling
- `WarpApp` / `WarpCore` bridge residue
- other internal files that still name `WarpRuntime` where a narrower
  capability should exist instead

## 0061 query-controller seam tranche

Cycle `0061` moved `QueryController` off direct `WarpRuntime` typing:

- `QueryController.ts` now receives a detached read factory and a state-hash
  callback explicitly
- observer snapshot resolution no longer imports `openDetachedGraph`
- the touched query seam no longer imports `WarpRuntime`

That means the remaining tail is now:

- detached graph / `Worldline` duplication
- `WarpApp` / `WarpCore` bridge residue
- other internal files that still name `WarpRuntime` where a narrower
  capability should exist instead

## 0062 worldline tranche

Cycle `0062` moved `Worldline.ts` onto the same detached-read seam:

- `Worldline.ts` now depends on `DetachedGraphFactory`
- the file no longer imports `WarpRuntime`
- the runtime observer cast corridor is gone
- `SLUDGE_detached-graph-duplication` is now materially satisfied

That means the remaining migration tail is:

- `WarpApp` / `WarpCore` bridge residue
- other internal files that still name `WarpRuntime` where a narrower
  capability should exist instead

## 0063 warpapp tranche

Cycle `0063` moved `WarpApp.ts` off direct runtime typing:

- `WarpApp.ts` now defines an explicit app-surface contract
- the file no longer imports `WarpRuntime`
- content reads now route through that surface instead of
  `callInternalRuntimeMethod(...)`

That means the remaining migration tail is now centered on:

- `WarpCore` bridge residue
- other internal files that still name `WarpRuntime` where a narrower
  capability should exist instead

## 0064 warpcore tranche

Cycle `0064` moved `WarpCore.ts` off direct runtime typing:

- `WarpCore.ts` now depends on `warp/WarpCoreRuntimeBridge.ts` instead of
  importing `WarpRuntime` directly
- strand and comparison methods now route through
  `callInternalRuntimeMethod(...)` instead of `WarpRuntime.prototype.*`
- strand patch list options now use an explicit
  `{ ceiling?: number | null }` shape instead of a raw
  `Record<string, unknown>` bag

That means the remaining migration tail is now:

- `openWarpGraph()` still builds frozen capability bags by binding a live
  `WarpRuntime`
- runtime helper wrappers and wiring surfaces still name `WarpRuntime`
- `API_kill-warpruntime` is now the focused remaining bridge cut

## 0065 closeout

Cycles `0059` through `0064` finished the consumer migration task itself:

- public capability bag + sync seam
- `Observer`
- `QueryController`
- `Worldline`
- `WarpApp`
- `WarpCore`

That means this note is now materially satisfied. The remaining runtime work is
no longer “migrate internal consumers from `WarpRuntime`.” It is:

- move the `openWarpGraph()` composition root off direct `WarpRuntime` binding
- remove runtime helper wrapper residue
- delete runtime wiring / `_wiredMethods` / `WarpRuntime` itself

Those cuts now belong under `API_kill-warpruntime`.

## Deferred content accessor surface

Cycle `0051` closed `SLUDGE_content-access-duplication` as already
materially satisfied at the implementation seam:
`src/domain/services/controllers/QueryContent.ts` now owns the shared
node/edge content lookup and blob-access logic.

The remaining part of that old sludge card is not implementation
deduplication. It is a public capability surface change:

- `query.nodeContent(nodeId)` returning a `NodeContent` accessor
- `query.edgeContent(from, to, label)` returning an `EdgeContent`
  accessor

If that surface still ships in `v17`, it belongs here as part of the
capability migration and consumer cutover, not as a separate sludge
task.

## Consumer migration signatures

### Worldline.ts
```typescript
// BEFORE
constructor({ graph }: { graph: WarpRuntime })

// AFTER
constructor({ query, materialize }: {
  query: QueryCapability;
  materialize: MaterializeCapability;
})
```

### Observer.ts / LogicalTraversal.ts
```typescript
// BEFORE
constructor({ graph }: { graph: WarpRuntime })

// AFTER
constructor({ graph }: { graph: ObserverBacking })
```

### QueryBuilder.ts
```typescript
// BEFORE
constructor({ graph }: { graph: WarpRuntime })

// AFTER
constructor({ query }: { query: QueryCapability })
```

### ComparisonSelector.ts
```typescript
// BEFORE
constructor({ graph }: { graph: WarpRuntime })

// AFTER
constructor({ materialize, sync }: {
  materialize: MaterializeCapability;
  sync: SyncCapability;
})
```
