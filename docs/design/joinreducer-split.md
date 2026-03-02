# RFC: JoinReducer Split (B144)

**Status:** DESIGN
**Author:** HEX_AUDIT → M14.T7
**Date:** 2026-03-02
**Scope:** Pure extraction of functions into new modules — no behavioral changes

---

## Problem

`JoinReducer.js` is 1096 LOC containing 6 distinct concerns in a single file:

1. **Op validation** — `validateOp`, `requireString`, `requireIterable`,
   `requireDot`, `RAW_KNOWN_OPS`, `CANONICAL_KNOWN_OPS`, `isKnownRawOp`,
   `isKnownCanonicalOp`, `isKnownOp` (lines 116–278)
2. **Receipt building** — `RECEIPT_OP_TYPE`, `VALID_RECEIPT_OPS`,
   `nodeAddOutcome`, `nodeRemoveOutcome`, `edgeAddOutcome`,
   `edgeRemoveOutcome`, `propOutcomeForKey`, `propSetOutcome`,
   `edgePropSetOutcome` (lines 353–557)
3. **Diff calculation** — `snapshotBeforeOp`, `accumulateOpDiff`,
   `collectNodeRemovals`, `collectEdgeRemovals`, `buildDotToElement`,
   `aliveElementsForDots` (lines 601–800)
4. **State factory** — `createEmptyStateV5`, `cloneStateV5`, `joinStates`,
   `mergeProps`, `mergeEdgeBirthEvent` (lines 81–89, 953–1016, 1087–1095)
5. **Frontier management** — `foldPatchDot`, `updateFrontierFromPatch`
   (lines 559–583)
6. **Core reduction** — `applyOpV2`, `applyFast`, `applyWithReceipt`,
   `applyWithDiff`, `join`, `reduceV5` (lines 288–1070)

This violates SRP: changes to receipt format require touching the same 1096-LOC
file as changes to state cloning. The file's import block pulls in 11 modules
even though most functions only need 2–3.

### Precedent: OpNormalizer Extraction

`OpNormalizer.js` (79 LOC) was already extracted from JoinReducer during M13.
JoinReducer re-exports its public symbols for backward compatibility:

```javascript
export { normalizeRawOp, lowerCanonicalOp } from './OpNormalizer.js';
```

This pattern works cleanly and is the template for all extractions proposed here.

---

## Design

Extract 4 new modules. JoinReducer shrinks to ~350 LOC of core reduction logic
plus re-exports from all extracted modules.

### Module 1: `WarpStateFactory.js` (~150 LOC)

**Extracted functions:**
- `createEmptyStateV5()` — creates empty V5 state
- `cloneStateV5(state)` — deep clone of V5 state
- `joinStates(a, b)` — CRDT join of two states
- `mergeProps(a, b)` — LWW-Max merge of property maps (private helper, exported for joinStates)
- `mergeEdgeBirthEvent(a, b)` — EventId-max merge of edge birth maps (private helper)
- `foldPatchDot(frontier, writer, lamport)` — fold patch dot into frontier
- `updateFrontierFromPatch(state, patch)` — merge patch context into state

**Dependencies:**
- `ORSet.js` — createORSet, orsetJoin, orsetClone
- `VersionVector.js` — createVersionVector, vvMerge, vvClone, vvDeserialize
- `LWW.js` — lwwMax
- `EventId.js` — compareEventIds

**Called by:**
- JoinReducer core (applyFast, applyWithReceipt, applyWithDiff, reduceV5)
- External consumers via JoinReducer re-exports: materialize.methods.js,
  materializeAdvanced.methods.js, provenance.methods.js, checkpoint.methods.js,
  patch.methods.js, query.methods.js, TemporalQuery.js, MigrationService.js,
  CheckpointSerializerV5.js, SyncProtocol.js, ProvenancePayload.js,
  CheckpointService.js, plus ~20 test files

### Module 2: `OpValidator.js` (~110 LOC)

**Extracted functions:**
- `validateOp(op)` — validates required fields per op type
- `requireString(op, field)` — asserts string field (private)
- `requireIterable(op, field)` — asserts iterable field (private)
- `requireDot(op)` — asserts dot structure (private)
- `RAW_KNOWN_OPS` — Set of raw wire-format op types
- `CANONICAL_KNOWN_OPS` — Set of canonical internal op types
- `isKnownRawOp(op)` — validates raw op type
- `isKnownCanonicalOp(op)` — validates canonical op type
- `isKnownOp(op)` — deprecated alias for isKnownRawOp

**Dependencies:**
- `PatchError.js` — error type for validation failures

**Called by:**
- JoinReducer core (applyOpV2 calls validateOp; applyWithReceipt and
  applyWithDiff call validateOp independently)
- External consumers via JoinReducer re-exports: SyncProtocol.js (isKnownRawOp)

### Module 3: `ReceiptBuilder.js` (~200 LOC)

**Extracted functions:**
- `RECEIPT_OP_TYPE` — internal→receipt type name mapping
- `VALID_RECEIPT_OPS` — Set of valid receipt op type strings
- `nodeAddOutcome(orset, op)` — NodeAdd receipt outcome
- `nodeRemoveOutcome(orset, op)` — NodeRemove receipt outcome
- `edgeAddOutcome(orset, op, edgeKey)` — EdgeAdd receipt outcome
- `edgeRemoveOutcome(orset, op)` — EdgeRemove receipt outcome
- `propOutcomeForKey(propMap, key, eventId)` — generic prop receipt outcome
- `propSetOutcome(propMap, op, eventId)` — NodePropSet receipt outcome
- `edgePropSetOutcome(propMap, op, eventId)` — EdgePropSet receipt outcome

**Dependencies:**
- `Dot.js` — encodeDot
- `EventId.js` — compareEventIds
- `KeyCodec.js` — encodeEdgeKey, encodePropKey, encodeEdgePropKey
- `ORSet.js` — read-only access (entries, tombstones)
- `TickReceipt.js` — OP_TYPES, createTickReceipt
- `DiffCalculator.js` — buildDotToElement (shared helper)

**Called by:**
- JoinReducer core (applyWithReceipt only)

**Note:** `buildDotToElement` is used by both ReceiptBuilder (for
nodeRemoveOutcome, edgeRemoveOutcome) and DiffCalculator (for
aliveElementsForDots). It should live in DiffCalculator since that's where
the more complex usage is; ReceiptBuilder imports it.

### Module 4: `DiffCalculator.js` (~160 LOC)

**Extracted functions:**
- `buildDotToElement(orset, targetDots)` — reverse dot→element index
- `aliveElementsForDots(orset, observedDots)` — alive elements owning dots
- `snapshotBeforeOp(state, op)` — pre-op alive-ness snapshot
- `accumulateOpDiff(diff, state, op, before)` — post-op diff accumulation
- `collectNodeRemovals(diff, state, before)` — node removal diff helper
- `collectEdgeRemovals(diff, state, before)` — edge removal diff helper

**Dependencies:**
- `KeyCodec.js` — encodeEdgeKey, decodeEdgeKey, encodePropKey, encodeEdgePropKey
- `ORSet.js` — orsetContains (read-only)
- `PatchDiff.js` — diff type

**Called by:**
- JoinReducer core (applyWithDiff only)
- ReceiptBuilder (buildDotToElement)

---

## Post-Extraction JoinReducer.js (~350 LOC)

After extraction, JoinReducer retains:

### Imports
```javascript
import { createEventId } from '../utils/EventId.js';
import { normalizeRawOp } from './OpNormalizer.js';
import { createEmptyDiff, mergeDiffs } from '../types/PatchDiff.js';
import { createTickReceipt } from '../types/TickReceipt.js';
import { validateOp } from './OpValidator.js';
import { createEmptyStateV5, cloneStateV5, updateFrontierFromPatch } from './WarpStateFactory.js';
import { snapshotBeforeOp, accumulateOpDiff } from './DiffCalculator.js';
import { RECEIPT_OP_TYPE, VALID_RECEIPT_OPS, nodeAddOutcome, ... } from './ReceiptBuilder.js';
import { encodeEdgeKey, encodePropKey, encodeEdgePropKey, EDGE_PROP_PREFIX } from './KeyCodec.js';
// CRDT imports for applyOpV2 only:
import { orsetAdd, orsetRemove } from '../crdt/ORSet.js';
import { lwwSet, lwwMax } from '../crdt/LWW.js';
import { compareEventIds } from '../utils/EventId.js';
```

### Retained Functions
- `applyOpV2(state, op, eventId)` — core op application (~65 LOC)
- `applyFast(state, patch, patchSha)` — fast path, no receipt/diff (~8 LOC)
- `applyWithReceipt(state, patch, patchSha)` — receipt path (~70 LOC)
- `applyWithDiff(state, patch, patchSha)` — diff path (~15 LOC)
- `join(state, patch, patchSha, collectReceipts)` — dispatch (~5 LOC)
- `reduceV5(patches, initialState, options)` — batch reduce (~30 LOC)

### Re-exports (Backward Compatibility)
```javascript
// From KeyCodec (existing)
export { encodeEdgeKey, decodeEdgeKey, encodePropKey, decodePropKey,
         EDGE_PROP_PREFIX, encodeEdgePropKey, isEdgePropKey, decodeEdgePropKey } from './KeyCodec.js';

// From OpNormalizer (existing)
export { normalizeRawOp, lowerCanonicalOp } from './OpNormalizer.js';

// From WarpStateFactory (new)
export { createEmptyStateV5, cloneStateV5, joinStates, foldPatchDot,
         updateFrontierFromPatch } from './WarpStateFactory.js';

// From OpValidator (new)
export { RAW_KNOWN_OPS, CANONICAL_KNOWN_OPS, isKnownRawOp,
         isKnownCanonicalOp, isKnownOp, validateOp } from './OpValidator.js';

// From ReceiptBuilder (new — only if external consumers need them)
export { RECEIPT_OP_TYPE, VALID_RECEIPT_OPS } from './ReceiptBuilder.js';

// From DiffCalculator (new — only if external consumers need them)
// (Currently no external consumers — these are internal to JoinReducer)
```

---

## Internal Call Graph

```
reduceV5()
  ├─ createEmptyStateV5()    [WarpStateFactory]
  ├─ cloneStateV5()          [WarpStateFactory]
  ├─ applyFast()             [JoinReducer core]
  │   ├─ normalizeRawOp()    [OpNormalizer]
  │   ├─ createEventId()     [EventId]
  │   ├─ applyOpV2()         [JoinReducer core]
  │   │   ├─ validateOp()    [OpValidator]
  │   │   └─ CRDT ops        [ORSet, LWW]
  │   └─ updateFrontierFromPatch() [WarpStateFactory]
  ├─ applyWithReceipt()      [JoinReducer core]
  │   ├─ normalizeRawOp()    [OpNormalizer]
  │   ├─ validateOp()        [OpValidator]
  │   ├─ createEventId()     [EventId]
  │   ├─ *Outcome()          [ReceiptBuilder]
  │   ├─ applyOpV2()         [JoinReducer core]
  │   ├─ updateFrontierFromPatch() [WarpStateFactory]
  │   └─ createTickReceipt() [TickReceipt]
  └─ applyWithDiff()         [JoinReducer core]
      ├─ normalizeRawOp()    [OpNormalizer]
      ├─ validateOp()        [OpValidator]
      ├─ createEventId()     [EventId]
      ├─ snapshotBeforeOp()  [DiffCalculator]
      ├─ applyOpV2()         [JoinReducer core]
      ├─ accumulateOpDiff()  [DiffCalculator]
      └─ updateFrontierFromPatch() [WarpStateFactory]

join()
  ├─ applyWithReceipt()      [JoinReducer core]
  └─ applyFast()             [JoinReducer core]

joinStates()                 [WarpStateFactory]
  ├─ orsetJoin()             [ORSet]
  ├─ mergeProps()            [WarpStateFactory internal]
  ├─ vvMerge()               [VersionVector]
  └─ mergeEdgeBirthEvent()   [WarpStateFactory internal]
```

---

## Migration Plan

Extract one module at a time. After each extraction, add re-exports to
JoinReducer.js and run the full test suite. No external imports change.

### Order: WarpStateFactory → OpValidator → ReceiptBuilder → DiffCalculator

This order minimizes intermediate churn:

1. **WarpStateFactory** — most widely imported symbols (`createEmptyStateV5`,
   `cloneStateV5`). Extract first to establish the pattern. No dependency on
   other new modules.

2. **OpValidator** — pure functions with a single dependency (PatchError).
   No dependency on other new modules.

3. **ReceiptBuilder** — depends on DiffCalculator's `buildDotToElement`. Two
   options:
   - **Option A:** Extract DiffCalculator first (reorder to step 3), then
     ReceiptBuilder imports from it.
   - **Option B (recommended):** Extract ReceiptBuilder with an inline copy
     of `buildDotToElement`, then in step 4 DiffCalculator becomes the
     canonical location and ReceiptBuilder imports from it.

4. **DiffCalculator** — last because ReceiptBuilder needs `buildDotToElement`.

### Per-Module Steps

For each extraction:

1. Create `src/domain/services/{NewModule}.js`
2. Move functions from JoinReducer.js into the new file
3. Add imports in JoinReducer.js from the new file
4. Add `export { ... } from './{NewModule}.js'` in JoinReducer.js
5. Run `npm run test:local` — all 4217+ tests must pass
6. Run `npm run lint` — clean
7. Commit

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Circular dependency between new modules | Low | Dependency graph is acyclic by design. DiffCalculator → ReceiptBuilder is one-way. |
| Re-export misses a symbol | Medium | Grep for all imports from JoinReducer.js across src/ and test/. The matrix above lists every external consumer. |
| Performance regression from module boundary overhead | Negligible | V8 inlines across module boundaries. The functions are called O(ops) times, not in tight inner loops. |
| `buildDotToElement` shared between ReceiptBuilder and DiffCalculator | Low | Place in DiffCalculator (primary user). ReceiptBuilder imports it. Clean one-way dep. |

---

## Verification

- `npm run test:local` — full unit + integration suite
- `WarpGraph.noCoordination.test.js` — multi-writer regression suite
- `npm run benchmark` — ReducerV5 benchmark should show no regression
- Verify re-export completeness:
  ```bash
  # Every symbol imported from JoinReducer.js must still resolve
  grep -rn "from.*JoinReducer" src/ test/ | grep -v node_modules
  ```

---

## Implementation Sequencing

**B144 is a pure extraction.** Re-exports preserve backward compatibility.
Follows the OpNormalizer precedent exactly. Single session.

**Gate:** `WarpGraph.noCoordination.test.js` must pass after each extraction.

**Implementation order within the broader SOLID effort:** B145 → B144 → B143.
B144 has no dependency on B145's port narrowing work.
