# 0101 Readonly Byte PropValue Snapshot

- Status: `GREEN blocked`
- Release lane: `v17.0.0`
- Source backlog: `IMM_readonly-byte-propvalue-snapshot`
- Blocks: `0096-purge-cast-hacks`
- Design role: corrective METHOD cycle
- Review audience: maintainers and future agents

## Hill

git-warp adjudicates whether byte-valued `PropValue` snapshots must be
runtime-immutable or explicitly documented as detached-only, so the 0100
immutable snapshot repair does not quietly mean "mostly immutable except
bytes."

## Why This Exists

0100 repaired the generic `clone<T>() -> T` lie and replaced descriptor
copying with source-specific snapshot builders. During closeout, the
cycle recorded this weak spot:

> `PropValue` snapshots clone `Uint8Array` values for detachment but do
> not make returned byte arrays intrinsically immutable.

That cannot remain casual hardening without a decision. A detached byte
copy prevents mutation of the live source, but it still allows mutation
of the snapshot value.

Detached is not immutable.

## Current Evidence

### Prior Cycle Context

This corrective cycle follows 0100, which closed with these phase
commits:

- `65de4362` `docs: pull immutable snapshot builder cycle`
- `58ebbedf` `docs: remove participant-specific sponsors from snapshot cycle`
- `5a8b77d4` `test: specify immutable snapshot builder`
- `c8bf2b71` `refactor: replace generic immutable snapshot cloning`
- `21a2a81a` `docs: record immutable snapshot builder green`
- `2524be45` `docs: record immutable snapshot builder playback`
- `c0e2bce2` `docs: record immutable snapshot builder drift check`
- `aede6792` `docs: record immutable snapshot builder retrospective`
- `b3be83dd` `docs: close immutable snapshot builder cycle`

0100 removed the generic snapshot clone lie. This cycle checks whether
one recorded 0100 weak spot contradicts the core immutable snapshot
guarantee.

### Source Evidence

`src/domain/types/PropValue.ts` includes byte values:

```ts
export type PropValue =
  | string
  | number
  | boolean
  | null
  | Uint8Array
  | PropValue[]
  | { [key: string]: PropValue };
```

`src/domain/services/ImmutableSnapshot.ts` currently snapshots bytes by
copying:

```ts
if (source instanceof Uint8Array) {
  return new Uint8Array(source);
}
```

That proves detachment from the source. It does not prove runtime
immutability of the returned bytes.

### Runtime Evidence

One-off command run during PULL:

```sh
node --experimental-strip-types --input-type=module <<'NODE'
import WarpState from './src/domain/services/state/WarpState.ts';
import { createImmutableWarpStateSnapshot } from './src/domain/services/ImmutableSnapshot.ts';
import { LWWRegister } from './src/domain/crdt/LWW.ts';
import { EventId } from './src/domain/utils/EventId.ts';
import WarpError from './src/domain/errors/WarpError.ts';

const key = 'node-a:bytes';
const source = new Uint8Array([1, 2, 3]);
const state = WarpState.empty();
state.prop.set(key, LWWRegister.set(new EventId(1, 'writer-a', 'aaaa', 0), source));
const snapshot = createImmutableWarpStateSnapshot(state);
const bytes = snapshot.prop.get(key)?.value;
if (!(bytes instanceof Uint8Array)) {
  throw new WarpError(
    'expected Uint8Array snapshot value',
    'E_READONLY_BYTE_SNAPSHOT_EVIDENCE',
  );
}
console.log(JSON.stringify({ before: Array.from(bytes), sameReference: bytes === source }));
bytes[0] = 9;
console.log(JSON.stringify({ after: Array.from(bytes), source: Array.from(source) }));
NODE
```

Observed output:

```json
{"before":[1,2,3],"sameReference":false}
{"after":[9,2,3],"source":[1,2,3]}
```

Interpretation:

- The snapshot byte value is detached from the source.
- Public callers can mutate the snapshot byte value.
- The live source is not mutated by that write.
- The snapshot itself is mutable.

## Required Questions

Question: Can `PropValue` include `Uint8Array` in public materialized
snapshots?

Answer: Yes. `PropValue` explicitly includes `Uint8Array`, and public
`WarpState` snapshots expose `state.prop` registers whose values are
`PropValue`.

Question: Can callers retrieve that `Uint8Array` from a snapshot?

Answer: Yes. A caller with a public `WarpState` snapshot can read
`snapshot.prop.get(key)?.value`.

Question: Can callers mutate it?

Answer: Yes. Runtime evidence shows `bytes[0] = 9` succeeds on the
snapshot byte value.

Question: If yes, does that violate the 0100 hill?

Answer: It may. 0100 says snapshots are detached, read-only public
read-side values. A mutable `Uint8Array` value contradicts the
read-only/deep-immutable interpretation. It does not contradict a
detached-only byte interpretation, but that interpretation is not yet
documented as the intended contract.

Question: Is the intended guarantee detached snapshot only, or deeply
immutable public snapshot?

Answer: Undecided. This cycle exists to make that decision explicit.

Question: If the intended guarantee is deep immutability, what is the
correct byte representation?

Answer: It cannot be fake `Readonly<Uint8Array>` compile-time theater.
It likely requires a runtime-backed immutable byte value or read-only
byte view that does not expose numeric element writes as mutable state.
Returning bare `Uint8Array` is insufficient for deep immutability.

Question: If the intended guarantee is detached-only for bytes, where is
that documented and tested?

Answer: Nowhere yet. If detached-only is accepted, the design and tests
must state that byte `PropValue` snapshots are detached but mutable, and
the project must stop describing that part as fully immutable.

## Decision Outcomes

### Outcome A: Fix Now

If public snapshot bytes must be runtime-immutable, GREEN must introduce
a real immutable byte representation or read-only byte view.

Rules:

- no `any`;
- no `as any`;
- no `as unknown as`;
- no fake `Readonly<Uint8Array>` compile-time theater;
- no pretending `Object.freeze(new Uint8Array(...))` is enough unless a
  runtime test proves mutation is blocked;
- no broad snapshot protocol;
- no generic clone helper.

Acceptance:

- public snapshot byte access cannot mutate snapshot state;
- source bytes remain detached;
- tests prove both properties.

### Outcome B: Explicit Detached-Only Byte Semantics

If byte-valued `PropValue` snapshots are intentionally detached-only,
GREEN must document and test that contract.

Rules:

- say "detached-only bytes", not "fully immutable bytes";
- test that source bytes are detached;
- test and document that snapshot bytes remain mutable;
- keep the bad-code backlog card open until a future cycle decides
  whether to add immutable byte values.

Acceptance:

- 0100 wording is corrected or qualified where needed;
- tests prove source detachment;
- release or API notes mention the limitation if it is public.

## RED Plan

Add `test/conformance/readonlyBytePropValueSnapshot.test.ts`.

The RED should prove current behavior directly:

- construct a `WarpState` with a `PropValue` `Uint8Array`;
- create a public `WarpState` snapshot;
- retrieve the byte value from `snapshot.prop`;
- attempt to mutate the byte value;
- assert the intended decision.

If the project chooses Outcome A, RED should expect mutation to be
blocked and fail today.

If the project chooses Outcome B, RED should expect source detachment and
explicitly assert mutable detached bytes while checking that the design
documents detached-only semantics.

Recommended RED before decision:

- write one failing test for deep immutability, because the phrase
  "immutable snapshot" currently implies mutation should be blocked.
- include a separate assertion that source detachment already holds.

## GREEN Plan

GREEN depends on the decision.

Outcome A GREEN:

1. Introduce a runtime-backed immutable byte snapshot representation.
2. Update `PropValue` snapshot behavior to return that representation
   only where the public API contract allows it.
3. If changing `PropValue` is too broad, stop and split a protocol/API
   design cycle instead of forcing a fake local patch.
4. Prove public mutation is impossible at runtime.
5. Preserve source detachment.

Outcome B GREEN:

1. Add tests proving byte values are detached from source bytes.
2. Add tests proving byte values remain mutable only if that is the
   accepted design.
3. Update 0100/0101 docs to describe byte snapshots as detached-only.
4. Keep or create backlog tracking for true runtime-immutable bytes.

## RED Witness

Command run:

```sh
npx vitest run test/conformance/readonlyBytePropValueSnapshot.test.ts
```

Expected result: fail.

Observed result: fail.

The RED test constructs a `WarpState`, stores a `Uint8Array` in
`state.prop`, creates a public snapshot with
`createImmutableWarpStateSnapshot`, retrieves the byte value through
`snapshot.prop.get(key)?.value`, and attempts to mutate the byte value
only when the public snapshot still exposes a `Uint8Array`.

The test intentionally does not require future snapshots to expose
`Uint8Array`. `Uint8Array` is today's mutable representation and part of
the bug. Future GREEN may replace that public representation with a
runtime-backed immutable byte value or read-only byte view. If GREEN
changes the representation, the RED must be updated to assert that
representation's immutable byte contract directly.

Evidence that source detachment already holds:

- `snapshotValue` is not the same object as `sourceBytes`.
- after `snapshotValue[0] = 9`, `sourceBytes` remains `[1, 2, 3]`.

Evidence that snapshot byte mutation still succeeds:

```txt
AssertionError: expected [ 9, 2, 3 ] to deeply equal [ 1, 2, 3 ]
```

This is the intended RED. It proves that the current behavior protects
the live source but still exposes mutable byte state through the public
snapshot.

The RED must not force fake immutable `Uint8Array` theater. It fences
off mutable public byte values, not a specific future representation.

No production source was edited during RED.

## GREEN Blocker

The first GREEN attempt introduced a proxy-backed read-only `Uint8Array`
facade and table-driven dispatch for scalar and method access. That
implementation is rejected.

Rejected implementation commits:

- `42b8fc80` `refactor: make byte propvalue snapshots immutable`
- `c614a40b` `docs: record readonly byte propvalue snapshot green`

Why rejected:

- A proxy-backed `Uint8Array` facade tries to preserve the wrong public
  representation.
- Method/scalar factory maps are dynamic dispatch sludge, not a domain
  model.
- The approach makes `Uint8Array` pretend to be an immutable class
  instead of introducing an explicit immutable byte value.

Correct model:

- Storage `PropValue` may include mutable `Uint8Array`.
- Snapshot byte values should be explicit immutable byte values such as
  `ImmutableBytes` or `ReadonlyBytes`.
- Snapshot value semantics therefore differ from storage value
  semantics.

Blocker:

`createImmutableWarpStateSnapshot` currently returns `WarpState`, and
`WarpState.prop` is typed as `Map<string, LWWRegister<PropValue>>`.
`PropValue` is the storage/value-decoding union and includes
`Uint8Array`, not `ImmutableBytes`.

Introducing `ImmutableBytes` honestly means the snapshot property value
type is no longer the same as storage `PropValue`. Returning `WarpState`
would therefore be type theater unless `PropValue` were broadened to
include snapshot-only values, which would collapse the storage/snapshot
distinction this cycle is trying to make explicit.

Required next design decision:

- define `ImmutableBytes` or `ReadonlyBytes` as a runtime-backed domain
  value;
- define `SnapshotPropValue`;
- decide whether immutable state snapshots need a distinct
  `SnapshotWarpState` or equivalent public read-side state type;
- update materialization/query APIs deliberately instead of forcing a
  fake local patch into `WarpState`.

Follow-up card:

- `docs/method/backlog/bad-code/IMM_snapshot-propvalue-api-model.md`

This cycle remains in GREEN blocked state. The RED still stands: public
immutable snapshots must not expose mutable byte values. No accepted
production implementation currently satisfies that contract.

## Playback Questions

### Agent

- Can a future agent tell whether byte `PropValue` snapshots are
  runtime-immutable or detached-only?
- Can a future agent tell how public callers can retrieve byte values?
- Can a future agent tell whether public mutation is allowed?
- Can a future agent tell what tests prove the byte behavior?
- Can a future agent avoid fake TypeScript-only readonly wrappers?

### Human

- Can maintainers see whether 0100's immutable snapshot guarantee still
  holds?
- Is the byte representation decision explicit enough?
- Is the public API impact clear?
- Is the follow-up scope narrow enough?

## Drift Risks

- Treating detached bytes as immutable bytes.
- Adding `Readonly<Uint8Array>` without runtime enforcement.
- Freezing typed arrays without a runtime test proving it blocks writes.
- Changing all `PropValue` byte semantics without an API decision.
- Creating a generic snapshot protocol to solve one byte issue.
- Reopening unrelated 0096 blockers.

## Edge Cases

- `Uint8Array` numeric element assignment is normal public mutation.
- `Object.freeze` is not a reliable answer for non-empty typed arrays.
- A `Proxy` around typed arrays may not preserve all typed-array
  invariants or method behavior.
- A value-object byte representation may require public API changes.
- `getNodeProps` and state-reader property bags may expose `PropValue`
  bytes outside direct `WarpState` access.

## Known Failure Modes

- Calling the cycle "hill met" while byte values remain silently mutable.
- Claiming runtime immutability through compile-time-only readonly types.
- Fixing direct `WarpState.prop` access but forgetting query/property bag
  access.
- Expanding into materialized-view storage seam casts.
- Leaving the decision undocumented.

## Non-Goals

- Do not pull `IDX_property-reader-capability-port`.
- Do not resume all of `0096-purge-cast-hacks`.
- Do not touch materialized-view storage seam casts.
- Do not introduce a broad snapshot protocol.
- Do not change snapshot persistence/default-on policy.
- Do not fix arbitrary `PropValue` modeling beyond the byte snapshot
  question.
