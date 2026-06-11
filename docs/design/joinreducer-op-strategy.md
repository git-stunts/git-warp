# Design: JoinReducer Op Strategy Registry

**Status:** DESIGN
**Date:** 2026-04-01
**Scope:** Structural coupling of the three JoinReducer apply paths via strategy-per-op pattern

---

## Problem

The JoinReducer has three entry points that loop over patch operations:

| Entry Point | Purpose | Hot Path? |
|---|---|---|
| `applyFast(state, patch, sha)` | Bulk materialization | Yes |
| `applyWithReceipt(state, patch, sha)` | Provenance / tick receipts | No |
| `applyWithDiff(state, patch, sha)` | Incremental index updates | No |

All three share the same mutation core (`applyPatchOp`), but the receipt and diff
paths add pre-mutation introspection and post-mutation metadata collection via
**separate switch statements** over the same 8 canonical op types:

1. **`applyPatchOp`** (L295) — mutation switch
2. **`applyWithReceipt`** (L869) — inline outcome switch
3. **`snapshotBeforeOp`** (L682) + **`accumulateOpDiff`** (L730) — snapshot/accumulate switches
4. **`validateOp`** (L247) — validation switch

Five switch statements, same enum. If a 9th op type is introduced, all five
must be updated. Miss one and the system produces wrong receipts or wrong diffs
while the CRDT state remains correct — a silent metadata integrity violation.

This is a DRY violation at the architectural level. The three paths are
*structurally decoupled* when they should be *structurally coupled*.

## Non-Problem

The CRDT kernel is NOT bifurcated. All three paths call `applyPatchOp()` for
state mutation. The deterministic guarantees of the reduction engine are
intact. The risk is in the metadata layers, not the state layer.

## Solution: Strategy-Per-Op Registry

Each canonical op type defines a **strategy object** with five methods:

```js
/**
 * @typedef {Object} OpStrategy
 * @property {(state: WarpStateV5, op: OpLike, eventId: EventId) => void} mutate
 *   Applies the operation to CRDT state. Called by all three paths.
 * @property {(state: WarpStateV5, op: OpLike, eventId: EventId) => OpOutcomeResult} outcome
 *   Pre-mutation outcome determination for receipts. Called by applyWithReceipt only.
 * @property {(state: WarpStateV5, op: OpLike) => SnapshotBeforeOp} snapshot
 *   Pre-mutation state snapshot for diffs. Called by applyWithDiff only.
 * @property {(diff: PatchDiff, state: WarpStateV5, op: OpLike, before: SnapshotBeforeOp) => void} accumulate
 *   Post-mutation diff accumulation. Called by applyWithDiff only.
 * @property {(op: OpLikeRecord) => void} validate
 *   Validates required fields. Throws PatchError on malformed ops.
 */
```

A frozen `Map<string, OpStrategy>` replaces all five switches:

```js
const OP_STRATEGIES = Object.freeze(new Map([
  ['NodeAdd',      nodeAddStrategy],
  ['NodeRemove',   nodeRemoveStrategy],
  ['EdgeAdd',      edgeAddStrategy],
  ['EdgeRemove',   edgeRemoveStrategy],
  ['NodePropSet',  nodePropSetStrategy],
  ['EdgePropSet',  edgePropSetStrategy],
  ['PropSet',      propSetStrategy],    // legacy compat
  ['BlobValue',    blobValueStrategy],
]));
```

### How the Three Paths Use Strategies

**`applyFast`** (hot path — zero overhead preserved):

```js
export function applyFast(state, patch, patchSha) {
  for (let i = 0; i < patch.ops.length; i++) {
    const op = patch.ops[i];
    if (op === undefined) { continue; }
    const canonOp = normalizeRawOp(op);
    const strategy = OP_STRATEGIES.get(canonOp.type);
    if (!strategy) { throw unknownOpError(canonOp.type); }
    const eventId = createEventId(patch.lamport, patch.writer, patchSha, i);
    strategy.mutate(state, canonOp, eventId);
  }
  updateFrontierFromPatch(state, patch);
  return state;
}
```

Only calls `.mutate()`. No receipt or diff allocation.

**`applyWithReceipt`**:

```js
// for each op:
strategy.validate(canonOp);
const outcome = strategy.outcome(state, canonOp, eventId);  // pre-mutation
strategy.mutate(state, canonOp, eventId);                    // mutation
// build receipt entry from outcome
```

**`applyWithDiff`**:

```js
// for each op:
strategy.validate(canonOp);
const before = strategy.snapshot(state, canonOp);            // pre-mutation
strategy.mutate(state, canonOp, eventId);                    // mutation
strategy.accumulate(diff, state, canonOp, before);           // post-mutation
```

### Strategy Method Mapping

Each strategy method is a thin wrapper around the existing function:

| Op Type | `.mutate()` | `.outcome()` | `.snapshot()` | `.accumulate()` | `.validate()` |
|---|---|---|---|---|---|
| NodeAdd | orsetAdd | nodeAddOutcome | check orsetContains | check alive transition | requireString('node'), requireDot |
| NodeRemove | orsetRemove | nodeRemoveOutcome | aliveElementsForDots | collectNodeRemovals | requireIterable('observedDots') |
| EdgeAdd | orsetAdd + edgeBirthEvent | edgeAddOutcome | check orsetContains | check alive transition | requireString('from','to','label'), requireDot |
| EdgeRemove | orsetRemove | edgeRemoveOutcome | aliveElementsForDots | collectEdgeRemovals | requireIterable('observedDots') |
| NodePropSet | lwwMax | propSetOutcome | read current reg | compare prev/post | requireString('node','key') |
| EdgePropSet | lwwMax | edgePropSetOutcome | read current reg | compare prev/post | requireString('from','to','label','key') |
| PropSet | lwwMax (with edge guard) | propSetOutcome | read current reg | compare prev/post | requireString('node','key') |
| BlobValue | no-op | always 'applied' | no-op | no-op | no-op |

### Structural Coupling Guarantee

At module load time, the registry is validated:

```js
for (const [type, strategy] of OP_STRATEGIES) {
  for (const method of ['mutate', 'outcome', 'snapshot', 'accumulate', 'validate']) {
    if (typeof strategy[method] !== 'function') {
      throw new Error(`OpStrategy '${type}' missing required method '${method}'`);
    }
  }
}
```

Adding a new op type without all five methods is a hard error at import time.

## Public API: No Changes

The following signatures and return types are unchanged:

- `applyFast(state, patch, patchSha) => WarpStateV5`
- `applyWithReceipt(state, patch, patchSha) => {state, receipt}`
- `applyWithDiff(state, patch, patchSha) => {state, diff}`
- `applyPatchOp(state, op, eventId) => void` (delegates to strategy.mutate)
- `join(state, patch, patchSha, collectReceipts)` — unchanged dispatcher
- `reducePatches(patches, initialState, options)` — unchanged
- All receipt/diff shapes unchanged

## Cross-Path Equivalence Test

New test file: `JoinReducer.pathEquivalence.test.js`

Applies identical patches through all three paths and asserts bitwise-equal
final state (all five WarpStateV5 fields). This is the regression test that
catches any future divergence between paths.

## Migration Steps

1. Define strategy objects using existing function bodies (no behavioral change)
2. Wire `applyPatchOp` to delegate to `strategy.mutate()` — verify tests pass
3. Wire `applyWithReceipt` to use `strategy.outcome()` — verify tests pass
4. Wire `applyWithDiff` to use `strategy.snapshot()` + `strategy.accumulate()` — verify tests pass
5. Wire validation to use `strategy.validate()` — verify tests pass
6. Delete dead switch bodies
7. Add cross-path equivalence test
8. Commit

Each step is independently verifiable with `npm run test:local`.

## Files Changed

| File | Change |
|---|---|
| `src/domain/services/JoinReducer.js` | Strategy registry, rewire 5 switches |
| `test/unit/domain/services/JoinReducer.pathEquivalence.test.js` | New: cross-path equivalence |

## Risks

- **Performance**: Strategy lookup via `Map.get()` is O(1) but adds one
  indirection per op. For `applyFast`, this replaces a switch (which V8
  optimizes to a jump table). Benchmark before/after to verify no regression.
- **Complexity budget**: The strategy objects add ~100 lines of boilerplate
  (8 objects x ~12 lines each). Net LOC should decrease because the five
  switch bodies are deleted.
