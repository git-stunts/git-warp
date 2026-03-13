# RFC: WarpGraph Decomposition (B143)

**Status:** DESIGN
**Author:** HEX_AUDIT → M14.T7
**Date:** 2026-03-02
**Scope:** Multi-phase extraction of classes from WarpGraph — each phase independently shippable

---

## Problem

`WarpGraph` has **42 instance fields** (constructor lines 56–187) and **8 method-
file groups** wired onto its prototype via `_wire.js`. The total surface is
~3600 LOC across the method files plus ~450 LOC in the class body.

Any new feature requires understanding all 42 fields to reason about
state invariants. Side effects cascade unpredictably — `_setMaterializedState()`
alone touches subscribers, provenance, adjacency, views, and caching.

### Current Field Inventory

| # | Field | Category | Used By |
|---|---|---|---|
| 1 | `_persistence` | Core | Everywhere |
| 2 | `_graphName` | Core | Everywhere |
| 3 | `_writerId` | Core | patch, fork, checkpoint |
| 4 | `_versionVector` | Core | materialize, patch |
| 5 | `_cachedState` | Cache | materialize, subscribe, query, provenance |
| 6 | `_stateDirty` | Cache | materialize, subscribe, sync |
| 7 | `_gcPolicy` | GC | patch, check |
| 8 | `_lastGCTime` | GC | patch |
| 9 | `_patchesSinceGC` | GC | patch, sync |
| 10 | `_patchesSinceCheckpoint` | Checkpoint | patch, checkpoint, sync |
| 11 | `_maxObservedLamport` | Core | materialize, patch |
| 12 | `_checkpointPolicy` | Checkpoint | patch, checkpoint |
| 13 | `_checkpointing` | Checkpoint | checkpoint |
| 14 | `_autoMaterialize` | Config | patch |
| 15 | `_materializedGraph` | Cache | materializeAdvanced, query |
| 16 | `_adjacencyCache` | Cache | materializeAdvanced, query |
| 17 | `_lastFrontier` | Cache | sync, materialize |
| 18 | `_logger` | Infra | Everywhere |
| 19 | `_clock` | Infra | Everywhere (timing) |
| 20 | `_crypto` | Infra | materialize, sync, patch |
| 21 | `_codec` | Infra | materialize, checkpoint, patch |
| 22 | `_onDeleteWithData` | Config | patch |
| 23 | `_subscribers` | Subscription | subscribe |
| 24 | `_lastNotifiedState` | Subscription | subscribe |
| 25 | `_provenanceIndex` | Provenance | provenance, materializeAdvanced |
| 26 | `_temporalQuery` | Provenance | temporal getter |
| 27 | `_seekCeiling` | Cache | materializeAdvanced |
| 28 | `_cachedCeiling` | Cache | materializeAdvanced |
| 29 | `_cachedFrontier` | Cache | materializeAdvanced |
| 30 | `_seekCache` | Cache | materializeAdvanced |
| 31 | `_patchInProgress` | Core | patch |
| 32 | `_provenanceDegraded` | Provenance | provenance, materializeAdvanced |
| 33 | `_audit` | Audit | patch |
| 34 | `_auditService` | Audit | patch |
| 35 | `_auditSkipCount` | Audit | patch |
| 36 | `_syncController` | Sync | delegated (already extracted) |
| 37 | `_viewService` | Cache | materializeAdvanced |
| 38 | `_logicalIndex` | Cache | materializeAdvanced |
| 39 | `_propertyReader` | Cache | materializeAdvanced |
| 40 | `_cachedViewHash` | Cache | materializeAdvanced |
| 41 | `_cachedIndexTree` | Cache | materializeAdvanced |
| 42 | `_indexDegraded` | Cache | materializeAdvanced |
| — | `traverse` | Public | public API (LogicalTraversal) |

(Note: 42 private fields + `traverse` public instance = 43 total instance
slots, but `_syncController` and `_viewService` are already delegated objects.)

### Existing Extraction: SyncController

`SyncController` (extracted in M12) provides the template for all proposed
extractions. Key patterns:

1. **Host typedef** — `SyncHost` (`SyncController.js:40–56`) documents every
   WarpGraph field/method the controller touches. Makes coupling explicit.

2. **Constructor injection** — `new SyncController(this)` passes `this`
   (the WarpGraph instance) as the host.

3. **Prototype delegation** — WarpGraph.js lines 436–451 loop over method
   names and use `Object.defineProperty` to create forwarding methods on
   `WarpGraph.prototype` that delegate to `this._syncController[method]()`.

4. **No stub file** — Unlike method-files (`*.methods.js`), the controller
   is a proper class. No `_wire.js` needed.

---

## Design

Extract 3 new classes following the SyncController template. Each class
owns a well-defined cluster of fields and methods.

### Phase 1: SubscriptionManager

**Extracts from:** `subscribe.methods.js` (258 LOC)

**Owned fields (moved from WarpGraph):**
- `_subscribers` — array of subscriber callbacks
- `_lastNotifiedState` — last state snapshot sent to subscribers

**Host fields accessed (remain on WarpGraph):**
- `_cachedState` (read) — current materialized state
- `_stateDirty` (read/write) — shared coordination flag

**Extracted methods:**

| Method | Visibility | LOC | Description |
|---|---|---|---|
| `subscribe(onChange, onError)` | public | ~60 | Register a subscriber callback |
| `watch(predicateFn, options)` | public | ~90 | Watch for state matching a predicate |
| `_notifySubscribers(diff)` | internal | ~80 | Fan-out state changes to subscribers |
| `_replayToNewSubscriber(sub)` | internal | ~20 | Initial notification for new subscriber |

**Host typedef (`SubscriptionHost`):**
```javascript
/**
 * @typedef {Object} SubscriptionHost
 * @property {import('../services/JoinReducer.js').WarpStateV5|null} _cachedState
 * @property {boolean} _stateDirty
 * @property {() => Promise<unknown>} materialize
 * @property {() => Promise<boolean>} hasFrontierChanged
 */
```

**Wiring pattern (WarpGraph.js):**
```javascript
this._subscriptionManager = new SubscriptionManager(this);

// Delegation (same pattern as SyncController):
for (const method of ['subscribe', 'watch']) {
  Object.defineProperty(WarpGraph.prototype, method, {
    value: function (...args) {
      return this._subscriptionManager[method](...args);
    },
    writable: true, configurable: true, enumerable: false,
  });
}
```

**Shared field problem: `_stateDirty`**

`_stateDirty` is set by the materialize pipeline and read by
SubscriptionManager to decide whether to notify. It is also read by
SyncController.

**Proposed solution:** Keep `_stateDirty` on WarpGraph as a coordinator-
owned flag. SubscriptionManager reads it through the host reference
(`this._host._stateDirty`). This is the same pattern SyncController uses.

**Integration point:** After `_setMaterializedState()` completes, WarpGraph
calls `this._subscriptionManager._notifySubscribers(diff)`. This replaces
the current inline notification logic in `_setMaterializedState()`.

### Phase 2: ProvenanceManager

**Extracts from:** `provenance.methods.js` (286 LOC)

**Owned fields (moved from WarpGraph):**
- `_provenanceIndex` — maps entity IDs to patch SHAs
- `_provenanceDegraded` — blocks provenance after seek
- `_temporalQuery` — lazy TemporalQuery instance

**Host fields accessed (remain on WarpGraph):**
- `_cachedState` (read) — for `_ensureFreshState()`
- `_persistence` (read) — for loading patches
- `_codec` (read) — for decoding patches
- `_clock` (read) — for timing
- `_logger` (read) — for logging

**Extracted methods:**

| Method | Visibility | LOC | Description |
|---|---|---|---|
| `patchesFor(entityId)` | public | ~50 | Backward provenance: patches affecting an entity |
| `materializeSlice(entityId)` | public | ~60 | Slice materialization for a single entity's causal cone |
| `_loadPatchBySha(sha)` | internal | ~25 | Load and decode a single patch by SHA |
| `_computeBackwardCone(entityId)` | internal | ~50 | Backward causal cone traversal |
| `_sortPatchesCausally(patches)` | internal | ~30 | Topological sort of patches |
| `_buildProvenanceIndex(patches)` | internal | ~40 | Build index from patch I/O |
| `temporal` (getter) | public | ~20 | Lazy TemporalQuery accessor |

**Host typedef (`ProvenanceHost`):**
```javascript
/**
 * @typedef {Object} ProvenanceHost
 * @property {import('../services/JoinReducer.js').WarpStateV5|null} _cachedState
 * @property {import('../../ports/GraphPersistencePort.js').default} _persistence
 * @property {import('../../ports/CodecPort.js').default} _codec
 * @property {import('../../ports/ClockPort.js').default} _clock
 * @property {import('../../ports/LoggerPort.js').default|null} _logger
 * @property {string} _graphName
 * @property {(op: string, t0: number, opts?: object) => void} _logTiming
 * @property {() => Promise<unknown>} materialize
 * @property {() => Promise<string[]>} discoverWriters
 * @property {(writerId: string) => Promise<Array<{patch: object, sha: string}>>} _loadWriterPatches
 */
```

**Degradation flag:** `_provenanceDegraded` is set by `_setMaterializedState()`
when a seek operation truncates history. ProvenanceManager owns this flag.
The materialize pipeline calls `this._provenanceManager.degrade()` instead of
directly setting the field.

**Index update hook:** During materialization, the provenance index is rebuilt
from patches. After extraction, `_setMaterializedState()` calls
`this._provenanceManager.setIndex(index)` to hand off the built index.

### Phase 3: CacheCoordinator

**Extracts from:** `materializeAdvanced.methods.js` (531 LOC) + parts of
`materialize.methods.js`

**Owned fields (moved from WarpGraph):**

| # | Field | Purpose |
|---|---|---|
| 1 | `_materializedGraph` | Cached adjacency+provider graph |
| 2 | `_adjacencyCache` | LRU cache for adjacency maps |
| 3 | `_cachedViewHash` | Hash of last materialized view |
| 4 | `_cachedIndexTree` | Serialized bitmap index tree |
| 5 | `_logicalIndex` | LogicalIndex (bitmap-backed) |
| 6 | `_propertyReader` | PropertyIndexReader |
| 7 | `_indexDegraded` | Flag for index degradation |
| 8 | `_seekCeiling` | Seek operation Lamport ceiling |
| 9 | `_cachedCeiling` | Cached seek ceiling |
| 10 | `_cachedFrontier` | Cached frontier map |
| 11 | `_seekCache` | SeekCachePort adapter |
| 12 | `_viewService` | MaterializedViewService |

**Host fields accessed (remain on WarpGraph):**
- `_cachedState` (read/write) — central state cache
- `_stateDirty` (read/write) — materialize coordination
- `_versionVector` (write) — updated after materialization
- `_persistence` (read) — for loading patches and views
- `_codec` (read) — for decoding
- `_crypto` (read) — for hashing
- `_logger` (read) — for logging
- `_clock` (read) — for timing
- `_graphName` (read) — for ref layout

**Core extracted method: `_setMaterializedState()`**

This is the convergence point — it's called after every successful
materialization and orchestrates:

1. Update `_cachedState` (on host)
2. Update `_versionVector` (on host)
3. Clear `_stateDirty` (on host)
4. Build/update adjacency maps → store in `_materializedGraph`
5. Build/persist materialized view → update `_cachedViewHash`
6. Build/update bitmap index → update `_logicalIndex`, `_propertyReader`
7. Update seek cache → update `_cachedCeiling`, `_cachedFrontier`
8. Notify subscribers → call `SubscriptionManager._notifySubscribers()`
9. Update provenance index → call `ProvenanceManager.setIndex()`

**After extraction, this becomes a method on CacheCoordinator that receives
the new state and diff, then calls back to the host for steps 1–3 and
delegates to SubscriptionManager/ProvenanceManager for steps 8–9.**

**Extracted methods:**

| Method | Visibility | LOC | Description |
|---|---|---|---|
| `_setMaterializedState(state, opts)` | internal | ~120 | Central convergence point |
| `_buildAdjacency(state)` | internal | ~60 | Build in-memory adjacency maps |
| `_buildView(state)` | internal | ~50 | Build and persist materialized view |
| `_restoreIndexFromCache()` | internal | ~40 | Restore bitmap index from cache |
| `_persistSeekCacheEntry(state)` | internal | ~30 | Persist seek cache entry |
| `materializeIncremental(options)` | internal | ~80 | Incremental materialization path |
| `_materializeWithSeek(options)` | internal | ~100 | Seek-based materialization |
| `setSeekCache(cache)` | public | ~3 | Attach seek cache post-construction |

**Host typedef (`CacheHost`):**
```javascript
/**
 * @typedef {Object} CacheHost
 * @property {import('../services/JoinReducer.js').WarpStateV5|null} _cachedState
 * @property {boolean} _stateDirty
 * @property {import('../crdt/VersionVector.js').VersionVector} _versionVector
 * @property {string} _graphName
 * @property {import('../../ports/GraphPersistencePort.js').default} _persistence
 * @property {import('../../ports/CodecPort.js').default} _codec
 * @property {import('../../ports/CryptoPort.js').default} _crypto
 * @property {import('../../ports/ClockPort.js').default} _clock
 * @property {import('../../ports/LoggerPort.js').default|null} _logger
 * @property {number} _maxObservedLamport
 * @property {(op: string, t0: number, opts?: object) => void} _logTiming
 * @property {() => Promise<{frontier: Map<string, string>}>} getFrontier
 * @property {() => Promise<string[]>} discoverWriters
 * @property {(writerId: string) => Promise<Array<{patch: object, sha: string}>>} _loadWriterPatches
 */
```

**Callback-based coordination:**

Instead of reaching back into the host for every field update,
`_setMaterializedState()` returns a result object that the host (WarpGraph)
uses to update its own core fields:

```text
// In CacheCoordinator:
setMaterializedState(state, opts) {
  // ... build adjacency, view, index ...
  return { state, versionVector, diff, provenanceIndex };
}

// In WarpGraph (the caller):
const result = this._cacheCoordinator.setMaterializedState(newState, opts);
this._cachedState = result.state;
this._versionVector = result.versionVector;
this._stateDirty = false;
this._provenanceManager.setIndex(result.provenanceIndex);
this._subscriptionManager._notifySubscribers(result.diff);
```

This avoids the host-mutation-via-reference pattern for the most critical
fields (`_cachedState`, `_versionVector`, `_stateDirty`) and keeps WarpGraph
as the explicit coordinator.

---

## Post-Extraction Field Count

| Location | Fields | Count |
|---|---|---|
| **WarpGraph** (retained) | `_persistence`, `_graphName`, `_writerId`, `_versionVector`, `_cachedState`, `_stateDirty`, `_gcPolicy`, `_lastGCTime`, `_patchesSinceGC`, `_patchesSinceCheckpoint`, `_maxObservedLamport`, `_checkpointPolicy`, `_checkpointing`, `_autoMaterialize`, `_lastFrontier`, `_logger`, `_clock`, `_crypto`, `_codec`, `_onDeleteWithData`, `_patchInProgress`, `_audit`, `_auditService`, `_auditSkipCount` | **24** |
| **WarpGraph** (delegated refs) | `_syncController`, `_subscriptionManager`, `_provenanceManager`, `_cacheCoordinator`, `traverse` | **5** |
| **SubscriptionManager** | `_subscribers`, `_lastNotifiedState` | **2** |
| **ProvenanceManager** | `_provenanceIndex`, `_provenanceDegraded`, `_temporalQuery` | **3** |
| **CacheCoordinator** | `_materializedGraph`, `_adjacencyCache`, `_cachedViewHash`, `_cachedIndexTree`, `_logicalIndex`, `_propertyReader`, `_indexDegraded`, `_seekCeiling`, `_cachedCeiling`, `_cachedFrontier`, `_seekCache`, `_viewService` | **12** |

WarpGraph drops from **38 slots → 29 slots** (24 own + 5 delegated refs),
with the 5 delegated refs being transparent forwarding objects. The effective
cognitive load drops from 38 to 24 fields — a 37% reduction.

**Further opportunities (not in scope):**

- **AuditManager** — `_audit`, `_auditService`, `_auditSkipCount` (3 fields)
  could be extracted following the same pattern, reducing WarpGraph to 21.
- **CheckpointManager** — `_checkpointPolicy`, `_checkpointing`,
  `_patchesSinceCheckpoint` (3 fields) could be extracted.
- **GCManager** — `_gcPolicy`, `_lastGCTime`, `_patchesSinceGC` (3 fields).

These are left as future work. Each is a straightforward application of the
same SyncController/SubscriptionManager template.

---

## Extraction Order

### Phase 1: SubscriptionManager (cleanest boundary)

**Why first:** The subscriber system has the cleanest boundary — only 2 owned
fields, 4 methods, and a well-defined notification protocol. It reads
`_cachedState` and `_stateDirty` but doesn't write any other field.

**Steps:**
1. Create `src/domain/services/SubscriptionManager.js` with Host typedef
2. Move functions from `subscribe.methods.js` into class methods
3. Add `_subscriptionManager` field to WarpGraph constructor
4. Add `Object.defineProperty` delegation for `subscribe` and `watch`
5. Update `_setMaterializedState()` to call
   `this._subscriptionManager._notifySubscribers(diff)`
6. Delete subscriber logic from `subscribe.methods.js` (or delete the file
   entirely and remove from `wireWarpMethods` array)
7. Run full test suite

**Independently shippable:** Yes. No dependency on Phase 2 or 3.

### Phase 2: ProvenanceManager (well-isolated)

**Why second:** Provenance methods are used only by the provenance API
(`patchesFor`, `materializeSlice`, `temporal` getter). The provenance index
is built during materialization and consumed by queries — a clean
producer/consumer relationship.

**Steps:**
1. Create `src/domain/services/ProvenanceManager.js` with Host typedef
2. Move functions from `provenance.methods.js` into class methods
3. Add `_provenanceManager` field to WarpGraph constructor
4. Add `Object.defineProperty` delegation for `patchesFor`,
   `materializeSlice`, and `temporal` getter
5. Replace `this._provenanceDegraded = true` with
   `this._provenanceManager.degrade()` in materialize paths
6. Replace `this._provenanceIndex = index` with
   `this._provenanceManager.setIndex(index)`
7. Update `provenanceIndex` getter to delegate:
   `return this._provenanceManager.index`
8. Delete provenance logic from `provenance.methods.js`
9. Run full test suite

**Independently shippable:** Yes. Benefits from Phase 1 being done (slightly
cleaner `_setMaterializedState`) but not strictly required.

### Phase 3: CacheCoordinator (most complex)

**Why last:** This is the most complex extraction because
`_setMaterializedState()` is the central convergence point. It benefits from
Phases 1–2 being done (subscriber notification and provenance index update
are already delegated, simplifying the coordinator's responsibilities).

**Steps:**
1. Create `src/domain/services/CacheCoordinator.js` with Host typedef
2. Move cache-related functions from `materializeAdvanced.methods.js`
3. Refactor `_setMaterializedState()` to return a result object instead of
   directly mutating host fields
4. Add `_cacheCoordinator` field to WarpGraph constructor
5. Wire `setSeekCache()` delegation
6. Update `materialize.methods.js` callers to use coordinator
7. Run full test suite, benchmarks

**May need its own design iteration:** The exact boundary of what moves to
CacheCoordinator vs. what stays in the materialize method files requires
careful line-by-line analysis. This RFC establishes the target architecture;
the implementer should create a detailed line-assignment plan before cutting
code.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `_setMaterializedState` refactor breaks subtle state ordering | Medium | High | Phase 3 requires exhaustive testing of materialize → subscribe → provenance notification order. The no-coordination test suite is the primary gate. |
| Host typedef drift as WarpGraph evolves | Low | Low | JSDoc typedefs are documentation — they don't prevent runtime access. Regular grep-based audits catch drift. |
| Performance regression from delegation overhead | Negligible | Low | V8 inlines `this._host.xxx` property access. Method delegation via `Object.defineProperty` is the same pattern already used for SyncController with no measurable cost. |
| CacheCoordinator accumulates too many responsibilities | Medium | Medium | If Phase 3 feels unwieldy, split further into IndexCoordinator (bitmap index lifecycle) and ViewCoordinator (materialized view lifecycle). |
| Tests rely on private field access (`graph._subscribers`) | Medium | Low | Update tests to use public API (subscribe/watch) instead of poking internals. If test helpers need internals, use the Host typedef for a test-friendly interface. |

---

## Verification

Per-phase verification:

- `npm run test:local` — full unit + integration suite (4217+ tests)
- `WarpGraph.noCoordination.test.js` — multi-writer regression suite (non-negotiable)
- `npm run benchmark` — ReducerV5 + compaction benchmarks (no regression)
- `npm run lint` — ESLint clean
- Manual verification: `grep -rn '_subscribers\|_provenanceIndex\|_materializedGraph' src/domain/WarpGraph.js` confirms fields are gone from the class body

---

## Implementation Sequencing

**B143 is a multi-phase extraction.** Each phase is independently shippable.

- **Phase 1 (SubscriptionManager):** Cleanest boundary. Single session. Low risk.
- **Phase 2 (ProvenanceManager):** Well-isolated. Single session. Low risk.
- **Phase 3 (CacheCoordinator):** Most complex. May need its own design
  iteration for the `_setMaterializedState()` refactor. Consider a spike
  session before committing to the full extraction.

**Gate:** `WarpGraph.noCoordination.test.js` must pass after each phase.

**Implementation order within the broader SOLID effort:** B145 → B144 → B143
(phases 1 → 2 → 3). B143 benefits from reduced cognitive load after B144's
JoinReducer split (easier to reason about materialize → reduce → coordinate
flow when JoinReducer is already decomposed).
