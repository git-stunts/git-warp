# Ops are data bags, not domain objects

## Smell

`NodeAdd`, `EdgeAdd`, `NodeRemove`, `EdgeRemove`, `NodePropSet`,
`EdgePropSet` are passive data records. Their behavior lives externally
in `OpStrategies.ts` (validate, mutate, outcome, snapshot, accumulate)
and `OpValidator.ts` (field assertions).

This violates SSTS P3 ("Behavior belongs on the type that owns it")
and P1 ("Domain concepts require runtime-backed forms"). The ops ARE
the domain concepts — they represent graph mutations — but their
behavior is scattered across strategy classes and validators.

## Why it matters

- Adding a new op type requires touching 3+ files (the op class,
  OpStrategies, OpValidator, TickReceipt OP_TYPES) instead of one.
- The strategy dispatch is a glorified switch-on-type — exactly what
  `instanceof` dispatch replaces per SSTS P7.
- The ops cross a wire boundary (CBOR-encoded into Git blobs), but
  SSTS P5 says serialization is the codec's problem. The wire form
  and the domain form are different concerns. `OpNormalizer` already
  handles the boundary (`lowerCanonicalOp` / `normalizeRawOp`).

## What right looks like

Each op class owns its behavior:

```typescript
class NodeAdd extends Op {
  validate(): void { /* field assertions */ }
  mutate(state: WarpState, eventId: EventId): void { /* CRDT mutation */ }
  outcome(state: WarpState): OpOutcomeResult { /* receipt */ }
  snapshot(state: WarpState): SnapshotBeforeOp { /* pre-mutation */ }
  accumulate(diff: PatchDiff, state: WarpState, before: SnapshotBeforeOp): void { /* diff */ }
}
```

`OpStrategies.ts` dissolves. `OpValidator.ts` dissolves. The reducer
calls `op.mutate(state, eventId)` instead of `strategy.mutate(state, op, eventId)`.

## Files

- `src/domain/types/ops/NodeAdd.ts` (and siblings)
- `src/domain/services/OpStrategies.ts`
- `src/domain/services/OpStrategy.ts`
- `src/domain/services/OpValidator.ts`
- `src/domain/services/JoinReducer.ts` (dispatch site)

## Risk

This touches the reducer hot path. Needs careful benchmarking to
ensure the dispatch change doesn't regress materialization throughput.
