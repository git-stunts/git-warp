# 0102 Snapshot PropValue API Model

- Status: `PULL`
- Release lane: `v17.0.0`
- Source backlog: `IMM_snapshot-propvalue-api-model`
- Blocks: `0101-readonly-byte-propvalue-snapshot`
- Blocks: `0096-purge-cast-hacks`
- Design role: active METHOD cycle
- Review audience: maintainers and future agents

## Hill

git-warp defines an honest public snapshot value model so byte-valued
read-side properties are runtime-immutable instead of detached mutable
`Uint8Array` values wearing an immutable snapshot label.

## Why This Exists

0101 proved that the current public snapshot behavior is not fully
immutable for byte-valued properties:

- storage `PropValue` allows `Uint8Array`;
- `createImmutableWarpStateSnapshot` copies those bytes;
- callers can retrieve the copied `Uint8Array` from `snapshot.prop`;
- callers can mutate that copied byte array.

That protects the live source state, but it does not protect the
snapshot itself. Detached bytes are not immutable bytes.

Detached-only semantics were rejected. A proxy/table-dispatch
`Uint8Array` facade was also rejected because it preserved the wrong
public representation. The missing model is not a clever read-only
typed array. The missing model is a distinct snapshot value surface.

## Source Card

Pulled from:

`docs/method/backlog/bad-code/IMM_snapshot-propvalue-api-model.md`

The source card said:

- define an explicit runtime-backed immutable byte value;
- define `SnapshotPropValue`;
- decide whether immutable snapshots return `SnapshotWarpState`;
- decide how materialization APIs expose immutable snapshot state;
- decide how query/property-bag APIs expose snapshot values;
- avoid fake `WarpState` return types if snapshot values differ from
  storage values.

The backlog card is removed during PULL. This design packet is now the
active source of truth for the work.

## Files Inspected

- `docs/method/backlog/bad-code/IMM_snapshot-propvalue-api-model.md`
- `docs/design/0101-readonly-byte-propvalue-snapshot.md`
- `test/conformance/readonlyBytePropValueSnapshot.test.ts`
- `src/domain/types/PropValue.ts`
- `src/domain/services/ImmutableSnapshot.ts`
- `src/domain/services/state/WarpState.ts`
- `src/domain/capabilities/MaterializeCapability.ts`
- `src/domain/capabilities/QueryCapability.ts`
- `src/domain/RuntimeHost.ts`
- `src/domain/services/controllers/MaterializeHelpers.ts`
- `src/domain/services/controllers/QueryReads.ts`
- `src/domain/services/state/StateReader.ts`
- `src/domain/services/state/StateReaderContext.ts`
- `src/domain/services/strand/StrandCoordinator.ts`
- `test/type-check/consumer.ts`

## Current Evidence

### Storage PropValue Is Storage-Shaped

`src/domain/types/PropValue.ts` says `PropValue` is exactly the value
family that CBOR decode produces:

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

That is a storage/value-decoding model. It should not absorb
snapshot-only concepts.

### WarpState Is Live Storage State

`src/domain/services/state/WarpState.ts` stores mutable CRDT state:

```ts
prop: Map<string, LWWRegister<PropValue>>;
```

The class comment says `WarpState` is an entity and that reducers mutate
a live instance in place for performance before callers clone or
snapshot for public consumption.

That means `WarpState` is not the honest public immutable snapshot type
once snapshot property values differ from storage property values.

### ImmutableSnapshot Still Returns Storage Types

`src/domain/services/ImmutableSnapshot.ts` currently exposes:

```ts
export function createImmutableWarpStateSnapshot(state: WarpState): WarpState
```

Its property path creates `LWWRegister<PropValue>` values and returns a
new `Uint8Array` for byte properties:

```ts
function createPropValueSnapshot(source: PropValue): PropValue {
  if (source instanceof Uint8Array) {
    return new Uint8Array(source);
  }
  // ...
}
```

That proves detachment. It does not prove runtime immutability.

### Public Materialization APIs Return WarpState

`src/domain/capabilities/MaterializeCapability.ts`,
`src/domain/RuntimeHost.ts`, `src/domain/services/strand/StrandCoordinator.ts`,
and `src/domain/services/controllers/MaterializeHelpers.ts` all expose
materialized public state as `WarpState` or `{ state: WarpState;
receipts: readonly TickReceipt[] }`.

That is no longer honest if property bytes become `ImmutableBytes`.

### Query And Property-Bag APIs Return Loose Bags

`src/domain/capabilities/QueryCapability.ts` exposes:

```ts
getNodeProps(...): Promise<Record<string, unknown> | null>
getEdgeProps(...): Promise<Record<string, unknown> | null>
getStateSnapshot(): Promise<WarpState | null>
```

`src/domain/services/controllers/QueryReads.ts` uses a local
`PropertyBag = Record<string, PropValue>` and directly assigns
`register.value` into returned property bags.

`src/domain/services/state/StateReaderContext.ts` also builds visible
state property bags as `Record<string, unknown>` and assigns live
storage register values into those bags.

Those APIs must be brought under the same snapshot value model, or byte
values will keep leaking as mutable `Uint8Array` through property-bag
surfaces after direct `WarpState` snapshots are fixed.

### Existing RED

`test/conformance/readonlyBytePropValueSnapshot.test.ts` remains RED by
design. It proves:

- source bytes are detached;
- public snapshot bytes are still mutable when exposed as `Uint8Array`;
- the future implementation is allowed to stop exposing `Uint8Array`.

The test currently contains a placeholder `new Error(...)` for the
future non-`Uint8Array` branch. RED for this cycle must replace that
placeholder with direct assertions against the new snapshot byte model.

## Strict Scope Validation

### Original Failure

The failing test is
`test/conformance/readonlyBytePropValueSnapshot.test.ts`.

Exact broken behavior:

1. A live `WarpState` stores a `Uint8Array` in `state.prop`.
2. `createImmutableWarpStateSnapshot(state)` creates a detached public
   snapshot.
3. The snapshot exposes `snapshot.prop.get(key)?.value`.
4. That value is a copied `Uint8Array`.
5. Caller mutation such as `snapshotValue[0] = 9` mutates the public
   snapshot byte value.

The live source bytes remain detached and unchanged. The bug is not
source aliasing. The bug is that the public immutable snapshot exposes a
mutable byte value.

### Minimal Change Required

The smallest honest fix is to stop exposing `Uint8Array` for byte-valued
snapshot properties.

That requires:

- a runtime-backed immutable byte value;
- a snapshot property-value union that can contain that immutable byte
  value;
- a public snapshot state type whose `prop` map can contain snapshot
  property values without lying that it is still storage `WarpState`;
- read-side state field types for public graph/frontier fields that
  currently advertise storage mutators;
- public property-bag APIs that project storage `PropValue` into the
  same snapshot value family before returning byte values.

It does not require:

- a new generic snapshot protocol;
- a dedicated snapshot register class;
- content byte API changes;
- storage/reducer/checkpoint/index model changes.

### Concept Classification

| Concept | Classification | Scope Decision |
|---|---|---|
| `ImmutableBytes` | MUST | Required because detached-only semantics, proxy-backed `Uint8Array`, and fake `Readonly<Uint8Array>` are rejected. |
| `SnapshotPropValue` | MUST | Required because storage `PropValue` contains mutable `Uint8Array`, while snapshot byte values must be `ImmutableBytes`. |
| `SnapshotWarpState` | MUST | Required because `WarpState.prop` is `Map<string, LWWRegister<PropValue>>`; returning `WarpState` after projecting bytes to `ImmutableBytes` would be type theater. |
| `SnapshotPropertyBag` | COULD | The projection is required, but a named bag type is optional. Public APIs can return a readonly index shape over `SnapshotPropValue`. |
| `SnapshotPropRegister` | COULD | Not required. Existing `LWWRegister<T>` is already frozen and can carry `SnapshotPropValue` in snapshot maps. |
| `SnapshotORSet` | MUST | Required because `ORSet` exposes mutators and mutable public `entries` / `tombstones` fields. |
| `SnapshotVersionVector` | MUST | Required because `VersionVector` exposes `set` and `increment`; frozen runtime traps are not an honest public type surface. |

### Removed Or Downgraded Concepts

`SnapshotPropertyBag` is removed from the MUST surface. The public
property-bag projection is required, but the named alias is not.

`SnapshotPropRegister` is removed from the MUST surface. The minimal
snapshot state can use `ReadonlyMap<string, LWWRegister<SnapshotPropValue>>`.

Read-side OR-set and version-vector surfaces remain in scope because
`SnapshotWarpState` is the public immutable snapshot type. It must not
hand callers live-looking CRDT mutation APIs and rely on runtime traps.

### Final MUST-Only API Surface

The implementation cycle should introduce only:

- `ImmutableBytes`;
- `SnapshotPropValue`;
- `SnapshotORSet`;
- `SnapshotVersionVector`;
- `SnapshotWarpState`;
- source-specific projection functions from storage values to snapshot
  values.

The implementation cycle should not introduce `SnapshotPropRegister`,
`SnapshotPropertyBag` as a required public noun, a generic snapshot
protocol, or content byte API changes.

## Final Reduction: SnapshotWarpState

This pass challenges whether `SnapshotWarpState` is truly required.

### Assumption

Assume `SnapshotWarpState` does not exist.

Can the bug be fixed by only changing:

- `ImmutableBytes`;
- `SnapshotPropValue`;
- property-bag projections?

Answer: not for direct public state snapshots.

Those changes can fix `getNodeProps`, `getEdgeProps`, visible edge
props, observers, and state-reader property bags. They cannot honestly
fix `materialize()` or `getStateSnapshot()` while those methods still
return `WarpState`, because direct public state access exposes
`snapshot.prop`.

### Option A: Keep WarpState As Public Return Type

Shape:

- keep `materialize(): Promise<WarpState>`;
- keep `getStateSnapshot(): Promise<WarpState | null>`;
- change only the values inside `state.prop` to `SnapshotPropValue`.

Mutation result:

- This can block byte mutation at runtime if byte values are actually
  `ImmutableBytes`.

Type result:

- This introduces a type lie.
- `WarpState.prop` is `Map<string, LWWRegister<PropValue>>`.
- `PropValue` is storage-shaped and includes `Uint8Array`, not
  `ImmutableBytes`.
- Returning a `WarpState` whose `prop` contains
  `LWWRegister<SnapshotPropValue>` contradicts the class contract.

Ways to make the type checker accept it are all rejected:

- add `ImmutableBytes` to storage `PropValue`, which collapses storage
  and snapshot semantics;
- cast the snapshot prop map into `Map<string, LWWRegister<PropValue>>`,
  which is cast theater;
- make `WarpState` generic over property value type, which turns the
  live storage entity into a mixed storage/snapshot abstraction and
  leaves mutation/join/reducer methods on a public snapshot value.

Conclusion:

Option A has less visible API surface but only by hiding the mismatch in
`WarpState`. It fixes the runtime byte write while making the public
state type dishonest.

### Option B: Minimal Wrapper Around WarpState

Shape:

- keep a live/storage `WarpState` internally;
- expose a read-side object with the same public fields, except `prop`
  is projected to snapshot values.

Mutation result:

- This can block byte mutation at runtime.

Type result:

- If the wrapper is typed as `WarpState`, it repeats Option A's type
  lie.
- If the wrapper is typed honestly, it is a distinct public state type.

Surface result:

- The wrapper does not require less surface area than `SnapshotWarpState`
  because it must still name the public return type and its `prop`
  contract.
- A wrapper with honest typing is `SnapshotWarpState` by another
  implementation shape.

Conclusion:

Option B is acceptable only if its public type is `SnapshotWarpState`.
It may be implemented as a minimal runtime wrapper, but the API must not
pretend it returns `WarpState`.

### Final SnapshotWarpState Decision

`SnapshotWarpState` is MUST.

Concrete contradiction:

`WarpState` promises:

```ts
prop: Map<string, LWWRegister<PropValue>>;
```

The required immutable-byte fix needs public snapshot state to expose:

```ts
prop: ReadonlyMap<string, LWWRegister<SnapshotPropValue>>;
```

`SnapshotPropValue` must contain `ImmutableBytes`, and storage
`PropValue` must not. Therefore the public state snapshot cannot
honestly be typed as `WarpState`.

The minimal honest API surface keeps `SnapshotWarpState`, but it does
not add any extra snapshot register or generic snapshot framework.
The non-prop field audit below determines whether read-side CRDT field
types are required.

## Final Reduction: Property Bags And Fields

### SnapshotPropertyBag Challenge

Assume `SnapshotPropertyBag` does not exist.

Can public property APIs return this instead?

```ts
Readonly<{ [key: string]: SnapshotPropValue }>
```

Answer: yes.

The byte mutation bug is fixed by projecting values to
`SnapshotPropValue`, not by naming the bag. A named bag alias may improve
readability later, but it is not required to block public byte mutation.

Decision:

- Public property-bag projection is MUST.
- `SnapshotPropertyBag` as a named public noun is COULD.
- RED must not require the exact `SnapshotPropertyBag` name.

### LWWRegister Safety

`src/domain/crdt/LWW.ts` shows `LWWRegister<T>`:

- has `readonly eventId`;
- has `readonly value`;
- freezes itself in the constructor;
- exposes no instance mutators;
- uses `T` generically and does not assume `PropValue`;
- provides static constructors/helpers that create or select register
  values rather than mutating an existing instance.

Decision:

`LWWRegister<SnapshotPropValue>` is safe to expose in
`SnapshotWarpState.prop`.

`SnapshotPropRegister` is not required. Introducing it would be a new
register noun without evidence that the existing runtime-backed register
is unsafe.

### SnapshotWarpState Field Audit

`WarpState` currently exposes these public fields:

| Field | Live/storage type | Minimal snapshot type | Existing evidence | Decision |
|---|---|---|---|---|
| `nodeAlive` | `ORSet` | `SnapshotORSet` | `ORSet` exposes `add`, `remove`, `compact`, and public mutable `entries` / `tombstones` fields. Runtime traps are not type honesty. | MUST change. |
| `edgeAlive` | `ORSet` | `SnapshotORSet` | Same as `nodeAlive`. | MUST change. |
| `prop` | `Map<string, LWWRegister<PropValue>>` | `ReadonlyMap<string, LWWRegister<SnapshotPropValue>>` | This is the exact byte-value contradiction. | MUST change. |
| `observedFrontier` | `VersionVector` | `SnapshotVersionVector` | `VersionVector` exposes `set` and `increment`. Runtime frozen errors are not an honest public read surface. | MUST change. |
| `edgeBirthEvent` | `Map<string, EventId>` | `ReadonlyMap<string, EventId>` | 0100 uses a read-only map wrapper. `EventId` has readonly fields, freezes itself in the constructor, and exposes no mutators. | Use `ReadonlyMap`; no new noun required. |

There are no other public fields on `WarpState`.

### ORSet Public API Check

`ORSet` exposes:

- public mutable fields: `entries`, `tombstones`;
- mutators: `add`, `remove`, `compact`;
- read methods: `contains`, `elements`, `countEntries`,
  `countLiveDots`, `countTombstones`, `getDots`, `hasDot`,
  `isTombstoned`, `entriesIter`, `entryDotsIter`, `tombstonesIter`;
- non-mutating derivations: `join`, `clone`, `scopedClone`,
  `serialize`.

If `SnapshotWarpState.nodeAlive` is typed as `ORSet`, callers are told
they can call `add`, `remove`, `compact`, and mutate `entries` or
`tombstones`. A frozen runtime error is a mousetrap, not an honest
public read-side type.

Decision:

`SnapshotORSet` is MUST.

Minimal read surface:

```ts
class SnapshotORSet {
  contains(element: string): boolean;
  elements(): readonly string[];
  countEntries(): number;
  countLiveDots(): number;
  countTombstones(): number;
  getDots(element: string): readonly string[];
  hasDot(element: string, encodedDot: string): boolean;
  isTombstoned(encodedDot: string): boolean;
  entries(): readonly Readonly<{
    element: string;
    dots: readonly string[];
  }>[];
  entryDots(): readonly string[];
  tombstones(): readonly string[];
}
```

`SnapshotORSet` is a read-side view type for public snapshots. It is not
a new storage CRDT and must not include `add`, `remove`, `compact`,
public mutable `entries`, or public mutable `tombstones`.

It also must not return `Set` or `ReadonlySet`. `ReadonlySet` is only a
compile-time view; if the runtime object is a `Set`, callers can still
mutate it through normal JavaScript access or casts. Snapshot views
return defensive readonly arrays unless a future cycle introduces a
runtime-backed immutable set value.

Contract note:

- Returned arrays are read-result values, not live snapshot internals.
- Implementations must return frozen arrays or fresh defensive copies.
- Mutating a returned array or entry object must not mutate the
  `SnapshotORSet`.
- If GREEN chooses frozen arrays, tests must prove the returned arrays
  and entry objects are frozen.
- If GREEN chooses defensive-copy semantics, tests must prove mutation
  of returned arrays or entry objects does not alter later reads.

### VersionVector Public API Check

`VersionVector` exposes:

- mutators: `set`, `increment`;
- read methods: `get`, `has`, `size`, iterator, `keys`, `values`,
  `entries`, `descends`, `contains`, `equals`;
- non-mutating derivations: `merge`, `clone`;
- codec helper: static `serialize`.

If `SnapshotWarpState.observedFrontier` is typed as `VersionVector`,
callers are told they can call `set` and `increment`. A frozen runtime
error is again weaker than type honesty.

Decision:

`SnapshotVersionVector` is MUST.

Minimal read surface:

```ts
class SnapshotVersionVector {
  get(writerId: string): number | undefined;
  has(writerId: string): boolean;
  get size(): number;
  [Symbol.iterator](): IterableIterator<[string, number]>;
  keys(): IterableIterator<string>;
  values(): IterableIterator<number>;
  entries(): IterableIterator<[string, number]>;
  descends(other: SnapshotVersionVector): boolean;
  contains(dot: Dot): boolean;
  equals(other: SnapshotVersionVector): boolean;
}
```

`SnapshotVersionVector` is a public read-side view type. It is not a new
storage causal frontier and must not include `set` or `increment`.

### EventId Check

`EventId` has readonly fields, validates construction, freezes itself in
the constructor, and exposes no mutators. Reusing `EventId` values in a
`ReadonlyMap<string, EventId>` preserves snapshot semantics.

## Design Decision

### Decision Summary

Storage values and public snapshot values are different concepts.

Storage `PropValue` remains the decoded storage/property-register value
family and may include mutable `Uint8Array`.

Public immutable snapshots use `SnapshotPropValue`, whose byte member is
`ImmutableBytes`, not `Uint8Array`.

Public materialization and state-snapshot APIs return
`SnapshotWarpState`, not `WarpState`.

Public node/edge property-bag APIs return readonly bags of
`SnapshotPropValue`, not `Record<string, unknown>` and not storage
`PropValue` bags.

### Storage PropValue

Owner: domain storage/reducer model.

Decision:

- Keep `PropValue` storage-shaped.
- Keep `Uint8Array` in `PropValue`.
- Do not add `ImmutableBytes` to `PropValue`.
- Do not make storage decode produce snapshot values.
- Do not make patch construction accept `ImmutableBytes` as a storage
  property value.

Reason:

`PropValue` models storage and CBOR decode facts. Snapshot-only values
inside `PropValue` would collapse the storage/snapshot distinction and
make reducers, checkpoint load, index builders, and patch operations
carry a read-side output type they do not own.

### ImmutableBytes

Owner: domain read-side snapshot model.

Decision:

Use the name `ImmutableBytes`.

`ImmutableBytes` is a runtime-backed byte value for public snapshot
surfaces. It is not a subclass of `Uint8Array` and is not a proxy around
`Uint8Array`.

Required shape:

```ts
export default class ImmutableBytes {
  readonly #bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.#bytes = new Uint8Array(bytes);
    Object.freeze(this);
  }

  get length(): number {
    return this.#bytes.length;
  }

  at(index: number): number | undefined {
    return this.#bytes.at(index);
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.#bytes);
  }

  values(): IterableIterator<number> {
    return this.#bytes.values();
  }

  [Symbol.iterator](): IterableIterator<number> {
    return this.values();
  }
}
```

The implementation may add equality or canonical-byte helpers later if
a concrete caller needs them. It must not add mutation methods, numeric
index setters, proxy traps, or fake typed-array compatibility.

Why mutation is impossible through this API:

- callers never receive the private backing `Uint8Array`;
- `ImmutableBytes` has no public mutation method;
- numeric assignment on `ImmutableBytes` does not mutate backing bytes
  because it is not a typed array;
- `toUint8Array()` returns a defensive copy, so mutating that copy
  cannot mutate the snapshot;
- nested snapshot arrays and objects recursively contain
  `SnapshotPropValue`, so nested byte values also become
  `ImmutableBytes`.

### SnapshotPropValue

Owner: domain read-side snapshot model.

Decision:

Introduce a distinct snapshot value family:

```ts
export type SnapshotPropValue =
  | string
  | number
  | boolean
  | null
  | ImmutableBytes
  | readonly SnapshotPropValue[]
  | SnapshotPropObject;

export type SnapshotPropObject = {
  readonly [key: string]: SnapshotPropValue;
};
```

Rules:

- `SnapshotPropValue` is output-only.
- `SnapshotPropValue` never contains `Uint8Array`.
- `SnapshotPropValue` never flows into storage reducers or patch
  builders.
- Arrays are copied and frozen.
- Objects are copied and frozen.
- Byte values are represented by `ImmutableBytes`.

### Snapshot Property Bags And Registers

Owner: domain read-side snapshot model.

Decision:

Do not introduce a dedicated snapshot register in this cycle.

```ts
ReadonlyMap<string, LWWRegister<SnapshotPropValue>>
```

`LWWRegister<T>` is already frozen and can carry `SnapshotPropValue`
without creating another register noun. The bug is the mutable byte
value, not the register runtime form.

Introduce:

```ts
Readonly<{ [key: string]: SnapshotPropValue }>
```

Query and state-reader property APIs must return
`Readonly<{ [key: string]: SnapshotPropValue }> | null`, and visible
edge views must carry `props` with that same readonly shape.

Do not introduce `SnapshotPropRegister` unless RED or implementation
proves `LWWRegister<SnapshotPropValue>` cannot satisfy the public
snapshot map.

Do not introduce `SnapshotPropertyBag` as a required public noun unless
implementation proves the repeated inline shape is unclear or unstable.

### SnapshotORSet

Owner: domain read-side snapshot model.

Decision:

Introduce `SnapshotORSet` as the read-side view for `nodeAlive` and
`edgeAlive`.

`SnapshotORSet` exposes only read methods. It does not expose public
mutable `entries` / `tombstones`, and it does not expose `add`,
`remove`, or `compact`.

### SnapshotVersionVector

Owner: domain read-side snapshot model.

Decision:

Introduce `SnapshotVersionVector` as the read-side view for
`observedFrontier`.

`SnapshotVersionVector` exposes only read methods. It does not expose
`set` or `increment`.

### SnapshotWarpState

Owner: domain read-side snapshot model.

Decision:

Introduce `SnapshotWarpState`.

`SnapshotWarpState` is a public read-side state value built from a live
storage `WarpState`. It is not a subclass of `WarpState` and should not
pretend to satisfy `WarpState` mutation semantics.

Minimum required public shape:

```ts
export default class SnapshotWarpState {
  readonly nodeAlive: SnapshotORSet;
  readonly edgeAlive: SnapshotORSet;
  readonly prop: ReadonlyMap<string, LWWRegister<SnapshotPropValue>>;
  readonly observedFrontier: SnapshotVersionVector;
  readonly edgeBirthEvent: ReadonlyMap<string, EventId>;
}
```

This keeps `SnapshotWarpState` type-honest across all exposed public
fields. It does not expose live-looking CRDT mutators with runtime
freeze traps underneath.

### Snapshot Builder Boundary

Owner: domain read-side snapshot model.

Decision:

Replace the public snapshot builder with a source-specific projection:

```ts
createSnapshotWarpState(state: WarpState): SnapshotWarpState
createSnapshotPropValue(value: PropValue): SnapshotPropValue
createSnapshotORSet(value: ORSet): SnapshotORSet
createSnapshotVersionVector(value: VersionVector): SnapshotVersionVector
createImmutableTickReceiptArraySnapshot(
  receipts: readonly TickReceipt[],
): readonly TickReceipt[]
```

`createImmutableWarpStateSnapshot(state): WarpState` must be retired or
kept only as a temporary deprecated wrapper if it can be made to return
`SnapshotWarpState` without lying. It must not continue to promise
`WarpState` once snapshot values differ from storage values.

### Materialization API Semantics

Owner: public domain capabilities.

Decision:

Public materialization APIs return snapshot state:

```ts
materialize(): Promise<SnapshotWarpState>
materialize({ receipts: true }): Promise<{
  state: SnapshotWarpState;
  receipts: readonly TickReceipt[];
}>
materializeCoordinate(...): Promise<SnapshotWarpState | {
  state: SnapshotWarpState;
  receipts: readonly TickReceipt[];
}>
materializeAt(...): Promise<SnapshotWarpState>
```

Internal reducers, materialization controllers, checkpoint loaders,
index builders, and caches continue to use live/storage `WarpState`.
The public boundary is where `WarpState` becomes `SnapshotWarpState`.

### Query And Property-Bag Semantics

Owner: public query/read-side capabilities.

Decision:

Public property-bag APIs return snapshot property bags:

```ts
getNodeProps(...): Promise<Readonly<{ [key: string]: SnapshotPropValue }> | null>
getEdgeProps(...): Promise<Readonly<{ [key: string]: SnapshotPropValue }> | null>
getStateSnapshot(): Promise<SnapshotWarpState | null>
getEdges(): Promise<Array<{
  from: string;
  to: string;
  label: string;
  props: Readonly<{ [key: string]: SnapshotPropValue }>;
}>>
```

`QueryReads`, `StateReader`, `Observer`, `Worldline`, and query-builder
public property-bag paths must project storage `PropValue` to
`SnapshotPropValue` before returning values to callers.

Indexed property reads must also pass through the snapshot property
projection. Do not keep `record as PropertyBag` as the public return
bridge for snapshot values.

### Content Byte APIs Are Separate

Owner: public content-read APIs.

Decision:

`getContent`, `getEdgeContent`, and content stream APIs may continue to
return `Uint8Array` / `AsyncIterable<Uint8Array>` in this cycle.

Reason:

Those APIs return blob content bytes, not `PropValue` snapshot bytes.
If content byte immutability is required, it should be a separate
content API design cycle rather than smuggled into
`SnapshotPropValue`.

## API Migration Note

This is a public type correction:

- code that expects `materialize()` to return `WarpState` must move to
  `SnapshotWarpState`;
- code that expects property bags to be `Record<string, unknown>` must
  move to readonly snapshot property bags containing `SnapshotPropValue`;
- code that expects byte properties to be `Uint8Array` must read them
  as `ImmutableBytes` and call `toUint8Array()` when a mutable copy is
  needed.
- code that expects public snapshot `nodeAlive` / `edgeAlive` to expose
  mutable `ORSet` internals must move to the `SnapshotORSet` read
  surface.
- code that expects public snapshot `observedFrontier` to expose
  `VersionVector.set` or `VersionVector.increment` must move to the
  `SnapshotVersionVector` read surface.

The release notes for v17 should mention this if implementation lands
in the release branch.

## RED Plan

RED must make the API decision executable before implementation.

Add or update conformance coverage so the current repo fails for the
right reasons.

### Byte Snapshot Contract

Update `test/conformance/readonlyBytePropValueSnapshot.test.ts` so it
asserts the intended GREEN contract directly:

- public snapshot byte values are `ImmutableBytes`;
- `ImmutableBytes` is not `Uint8Array`;
- source bytes remain detached;
- iteration and `at(index)` expose byte contents;
- `toUint8Array()` returns a defensive mutable copy;
- mutating the copy does not mutate the snapshot;
- the test no longer contains a generic `new Error(...)` placeholder.

Expected RED today:

- current snapshot byte values are still `Uint8Array`;
- mutation of the snapshot byte value still succeeds.

### Public Type Surface Contract

Add `test/conformance/snapshotPropValueApiModel.test.ts`.

Assertions should inspect source/type-surface files and fail while:

- `MaterializeCapability` returns `WarpState` for public
  materialization;
- `QueryCapability.getStateSnapshot` returns `WarpState | null`;
- `QueryCapability.getNodeProps` and `getEdgeProps` return
  `Record<string, unknown> | null`;
- `VisibleEdge.props` is `Record<string, unknown>`;
- `SnapshotWarpState` does not expose `SnapshotORSet` for `nodeAlive`
  and `edgeAlive`;
- `SnapshotWarpState` does not expose `SnapshotVersionVector` for
  `observedFrontier`;
- `SnapshotORSet` exposes `Set` or `ReadonlySet` in its public return
  types instead of defensive readonly arrays;
- `SnapshotORSet` exposes `add`, `remove`, `compact`, public `entries`,
  or public `tombstones`;
- `SnapshotVersionVector` exposes `set` or `increment`;
- mutation of arrays returned by `SnapshotORSet.elements()`,
  `getDots(...)`, `entryDots()`, `tombstones()`, `entries()`, or nested
  `entries()[i].dots` can mutate later `SnapshotORSet` reads;
- `QueryReads` returns a storage `PropertyBag = Record<string,
  PropValue>`;
- `StateReaderContext` public visible property bags use
  `Record<string, unknown>`;
- `createImmutableWarpStateSnapshot(state): WarpState` remains the
  public snapshot builder;
- `PropValue.ts` mentions `ImmutableBytes` or snapshot-only values;
- source contains fake `Readonly<Uint8Array>` or proxy-backed byte
  immutability.

### Runtime Property-Bag Contract

Add focused runtime tests when GREEN starts:

- `materialize().prop.get(key)?.value` returns `ImmutableBytes` for byte
  properties;
- `getStateSnapshot()` returns the same byte representation;
- `getNodeProps()` returns a readonly snapshot property bag shape with
  `ImmutableBytes`;
- `getEdgeProps()` returns a readonly snapshot property bag shape with
  `ImmutableBytes`;
- `getEdges()[i].props` returns a readonly snapshot property bag shape
  with `ImmutableBytes`;
- `createStateReader(state).getNodeProps(...)` and
  `getEdgeProps(...)` return `ImmutableBytes` for byte values.

## GREEN Plan

GREEN belongs to the next implementation cycle.

Implementation order should be:

1. Introduce `ImmutableBytes`.
2. Introduce `SnapshotPropValue`.
3. Introduce `SnapshotORSet` and `SnapshotVersionVector`.
4. Introduce `SnapshotWarpState` and source-specific snapshot builders.
5. Change materialization capability return types to `SnapshotWarpState`.
6. Change query/property-bag return types to readonly snapshot property
   bag shapes over `SnapshotPropValue`.
7. Update runtime implementations to project storage values to snapshot
   values at public boundaries.
8. Update type-check consumer tests and release/API notes.
9. Keep storage reducers, patch builders, checkpoints, and index
   builders on storage `PropValue` and live `WarpState`.

## Playback Questions

### Agent

- Can a future agent tell that `PropValue` is storage-shaped and remains
  separate from `SnapshotPropValue`?
- Can a future agent tell that public snapshot byte values are
  `ImmutableBytes`, not `Uint8Array`?
- Can a future agent explain why `ImmutableBytes` cannot be mutated
  through the public API?
- Can a future agent tell that public materialization returns
  `SnapshotWarpState`, not `WarpState`?
- Can a future agent tell that public snapshot graph fields expose
  `SnapshotORSet`, not mutable `ORSet` internals?
- Can a future agent tell that public snapshot frontiers expose
  `SnapshotVersionVector`, not `VersionVector.set` or
  `VersionVector.increment`?
- Can a future agent tell that query/property-bag APIs return readonly
  bags of `SnapshotPropValue`?
- Can a future agent tell that content byte APIs are intentionally out
  of scope?
- Can a future agent avoid proxy-backed fake typed-array immutability?
- Can a future agent avoid broad generic snapshot protocol work?
- Can a future agent tell why 0101 remains blocked until this model is
  implemented?

### Human

- Can maintainers see what public APIs return for byte-valued snapshot
  properties?
- Is it clear why mutation is impossible through those APIs?
- Is the storage/snapshot value split explicit enough?
- Is the public API migration cost visible?
- Is the implementation sequence narrow enough?
- Are any affected query or property-bag surfaces missing from the plan?

## Drift Risks

- Reintroducing `Uint8Array` as the public snapshot byte representation.
- Adding `ImmutableBytes` to storage `PropValue`.
- Returning `WarpState` while placing snapshot-only values inside it.
- Returning `ORSet` or `VersionVector` from `SnapshotWarpState` and
  relying on frozen-runtime mutation traps.
- Keeping `Record<string, unknown>` property bags as a public escape
  hatch.
- Fixing `materialize()` but forgetting `getNodeProps`,
  `getEdgeProps`, `getEdges`, observers, or state readers.
- Treating content byte APIs as part of this cycle.
- Inventing a generic snapshot protocol instead of source-specific
  public snapshot values.
- Using proxy traps or `Readonly<Uint8Array>` theater to claim
  immutability.

## Edge Cases

- Nested arrays and objects may contain byte values and must recursively
  project to `SnapshotPropValue`.
- `ImmutableBytes.toUint8Array()` must return a fresh copy on every
  call.
- readonly snapshot property bags must not expose mutable nested arrays
  or objects.
- `SnapshotWarpState.prop` may use `LWWRegister<SnapshotPropValue>`;
  a new register class is unnecessary unless implementation proves
  otherwise.
- `SnapshotORSet` must not expose mutable `entries`, mutable
  `tombstones`, `add`, `remove`, or `compact`.
- `SnapshotORSet` must not expose `Set` or `ReadonlySet` return values
  unless a future cycle introduces a runtime-backed immutable set value.
- `SnapshotORSet` array return values must be frozen arrays or fresh
  defensive copies; mutating returned arrays must not mutate snapshot
  state.
- `SnapshotVersionVector` must not expose `set` or `increment`.
- Indexed property reads currently use a loose property-reader seam; the
  public return must still be projected to snapshot values.
- Consumers may compare old byte property values with
  `instanceof Uint8Array`; those checks must migrate.

## Known Failure Modes

- Calling the snapshot immutable while exposing mutable byte values.
- Preserving `WarpState` return types after public snapshot values stop
  being storage values.
- Preserving live CRDT field types on `SnapshotWarpState` and relying on
  runtime frozen errors as the public contract.
- Making `ImmutableBytes` a fancy wrapper with a public mutable byte
  reference.
- Hiding API breakage by casting.
- Treating `SnapshotPropValue` as a transport DTO.
- Leaving the existing RED as a permanent expected failure.

## Non-Goals

- Do not implement `ImmutableBytes` in this design-only cycle.
- Do not resume `0096-purge-cast-hacks`.
- Do not clean unrelated bad-code files.
- Do not touch cool-ideas.
- Do not change content byte APIs.
- Do not change checkpoint serialization, storage decode, patch
  construction, or reducer storage semantics.
- Do not introduce a broad generic snapshot protocol.
- Do not add proxy-backed fake immutable typed arrays.
- Do not downgrade to detached-only byte semantics.
