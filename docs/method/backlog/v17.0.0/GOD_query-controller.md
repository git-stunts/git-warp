# Slay QueryController (951 LOC)

## Current shape

12-line class body + 30 free functions wired via `defineProperty`.
Same sludge pattern as WarpRuntime. The class is a bag. The free
functions use `this._host._xxx` to reach into WarpRuntime internals.

## Natural groupings

The 20 public functions fall into 4 coherent capabilities:

### 1. Graph reads (~200 LOC)
Core node/edge/property queries against materialized state.

- `hasNode(nodeId)` — node existence
- `getNodes()` — all visible nodes
- `getNodeProps(nodeId)` — node properties
- `getEdgeProps(from, to, label)` — edge properties
- `getEdges()` — all visible edges
- `getPropertyCount()` — total property count
- `neighbors(nodeId, direction, edgeLabel)` — neighbor lookup
- `getStateSnapshot()` — full state snapshot

**Depends on:** materialized state (`_host._cachedState`), index
(`_host._cachedIndex`), KeyCodec, ImmutableSnapshot.

### 2. Query/traversal factories (~50 LOC)
Create higher-order query objects.

- `query()` — returns QueryBuilder
- `worldline(options)` — returns Worldline handle
- `observer(nameOrConfig, config, options)` — creates Observer

**Depends on:** QueryBuilder, Worldline, Observer, detached graph
cloning, selector normalization.

### 3. Content access (~300 LOC)
Blob content read operations for nodes and edges.

- `getContentOid(nodeId)` — content blob OID
- `getContentMeta(nodeId)` — content metadata (mime, size)
- `getContent(nodeId)` — full content bytes
- `getEdgeContentOid(from, to, label)` — edge content OID
- `getEdgeContentMeta(from, to, label)` — edge content metadata
- `getEdgeContent(from, to, label)` — edge content bytes
- `getContentStream(nodeId)` — streaming content
- `getEdgeContentStream(from, to, label)` — streaming edge content

**Depends on:** materialized state, blob storage, content register
helpers (`getNodeContentRegisters`, `getEdgeContentRegisters`,
`extractContentMeta`, `visibleEdgeRegister`).

### 4. Translation cost (~20 LOC)
Observer comparison utility.

- `translationCost(configA, configB)` — cost of translating between
  two observer configurations

**Depends on:** Observer, computeTranslationCost.

## Additional free functions (helpers, ~380 LOC)

- `toSelector(source)` — selector normalization
- `openDetachedObserverGraph(graph)` — creates detached clone
- `snapshotCurrentMaterialized(graph)` — snapshots current state
- `snapshotReturnedState(graph, state)` — snapshots returned state
- `resolveObserverSnapshot(graph, options)` — resolves observer state
- `normalizeObserverArgs(...)` — argument normalization
- `isSameAttachmentLineage(...)` — content lineage check
- `visibleEdgeRegister(...)` — edge register resolution
- `getNodeContentRegisters(...)` — node content registers
- `getEdgeContentRegisters(...)` — edge content registers
- `extractContentMeta(...)` — metadata extraction
- `tagDirection(edges, dir)` — direction tagging
- `_indexedNeighbors(...)` — bitmap index neighbors
- `_linearNeighbors(...)` — linear scan neighbors
- `singleChunkAsyncIterable(buf)` — streaming helper

## Split strategy

### Option A: 3 files (recommended)
- `QueryReads.ts` (~250 LOC) — graph reads + helpers
- `QueryContent.ts` (~350 LOC) — content access + content helpers
- `QueryController.ts` (~350 LOC) — factories, observer logic,
  translation cost, selector normalization, detached graph cloning

All under 500. QueryController remains the capability implementation
and composes the read/content modules internally.

### Option B: QueryController becomes the capability directly
When the capability interface lands, QueryController itself IS the
`QueryCapability` implementation. The free functions become real
methods. The `defineProperty` wiring dies. The `_host` reference
becomes injected dependencies (state provider, blob storage, index).

This is the end state. Option A is the intermediate step.

## Execution order

1. Extract content helpers to `QueryContent.ts`
2. Extract graph read helpers to `QueryReads.ts`
3. Convert remaining QueryController to TS with real methods
4. Delete defineProperty wiring
5. Update imports in WarpRuntime.js

## Sludge that MUST die during this split

1. **No `_host` bag.** Each extracted module gets typed deps:
   `QueryReads` gets `MaterializedStateProvider` + `IndexProvider`.
   `QueryContent` gets `BlobStoragePort` + `MaterializedStateProvider`.
   See `SLUDGE_host-bag-injection.md`.

2. **Free functions become real methods.** The 30 `this`-bound free
   functions wired via `defineProperty` become methods on the class
   or module that owns them. No `this`-bound free functions survive.

3. **Content duplication → `NodeContent` / `EdgeContent`.** The 8
   content methods collapse into 2 content accessor factories.
   See `SLUDGE_content-access-duplication.md`.

4. **`openDetachedObserverGraph` → shared `DetachedGraphFactory`.**
   See `SLUDGE_detached-graph-duplication.md`.
