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

## Design Decision

### Decision Summary

Storage values and public snapshot values are different concepts.

Storage `PropValue` remains the decoded storage/property-register value
family and may include mutable `Uint8Array`.

Public immutable snapshots use `SnapshotPropValue`, whose byte member is
`ImmutableBytes`, not `Uint8Array`.

Public materialization and state-snapshot APIs return
`SnapshotWarpState`, not `WarpState`.

Public node/edge property-bag APIs return `SnapshotPropertyBag`, not
`Record<string, unknown>` and not storage `PropValue` bags.

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

### Snapshot Registers And Property Bags

Owner: domain read-side snapshot model.

Decision:

Introduce a snapshot register value for property maps:

```ts
export class SnapshotPropRegister {
  readonly eventId: EventId | null;
  readonly value: SnapshotPropValue;
}
```

The implementation may use a more specific name if the source suggests
one, but it must not keep returning `LWWRegister<PropValue>` on public
snapshot surfaces.

Introduce:

```ts
export type SnapshotPropertyBag = {
  readonly [key: string]: SnapshotPropValue;
};
```

Query and state-reader property APIs must return
`SnapshotPropertyBag | null`, and visible edge views must carry
`props: SnapshotPropertyBag`.

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
  readonly nodeAlive: ReadonlyOrSetSnapshot;
  readonly edgeAlive: ReadonlyOrSetSnapshot;
  readonly prop: ReadonlyMap<string, SnapshotPropRegister>;
  readonly observedFrontier: ReadonlyVersionVectorSnapshot;
  readonly edgeBirthEvent: ReadonlyMap<string, EventId>;
}
```

The exact names for the read-only OR-set and version-vector snapshots
may be sharpened during implementation. The important rule is that the
public snapshot state type must not expose mutable storage collections
or `LWWRegister<PropValue>` values.

If preserving direct `.nodeAlive.contains(...)` and `.edgeAlive.elements()`
read behavior is necessary for compatibility, those read methods should
live on read-only snapshot wrappers. Do not return mutable `ORSet`
instances as a shortcut.

### Snapshot Builder Boundary

Owner: domain read-side snapshot model.

Decision:

Replace the public snapshot builder with a source-specific projection:

```ts
createSnapshotWarpState(state: WarpState): SnapshotWarpState
createSnapshotPropValue(value: PropValue): SnapshotPropValue
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
getNodeProps(...): Promise<SnapshotPropertyBag | null>
getEdgeProps(...): Promise<SnapshotPropertyBag | null>
getStateSnapshot(): Promise<SnapshotWarpState | null>
getEdges(): Promise<Array<{
  from: string;
  to: string;
  label: string;
  props: SnapshotPropertyBag;
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
  move to `SnapshotPropertyBag`;
- code that expects byte properties to be `Uint8Array` must read them
  as `ImmutableBytes` and call `toUint8Array()` when a mutable copy is
  needed.

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
- `getNodeProps()` returns `SnapshotPropertyBag` with `ImmutableBytes`;
- `getEdgeProps()` returns `SnapshotPropertyBag` with `ImmutableBytes`;
- `getEdges()[i].props` returns `SnapshotPropertyBag` with
  `ImmutableBytes`;
- `createStateReader(state).getNodeProps(...)` and
  `getEdgeProps(...)` return `ImmutableBytes` for byte values.

## GREEN Plan

GREEN belongs to the next implementation cycle.

Implementation order should be:

1. Introduce `ImmutableBytes`.
2. Introduce `SnapshotPropValue`, `SnapshotPropRegister`, and
   `SnapshotPropertyBag`.
3. Introduce `SnapshotWarpState` and source-specific snapshot builders.
4. Change materialization capability return types to `SnapshotWarpState`.
5. Change query/property-bag return types to `SnapshotPropertyBag`.
6. Update runtime implementations to project storage values to snapshot
   values at public boundaries.
7. Update type-check consumer tests and release/API notes.
8. Keep storage reducers, patch builders, checkpoints, and index
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
- Can a future agent tell that query/property-bag APIs return
  `SnapshotPropertyBag`?
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
- `SnapshotPropertyBag` objects must not expose mutable nested arrays or
  objects.
- Indexed property reads currently use a loose property-reader seam; the
  public return must still be projected to snapshot values.
- Consumers may compare old byte property values with
  `instanceof Uint8Array`; those checks must migrate.

## Known Failure Modes

- Calling the snapshot immutable while exposing mutable byte values.
- Preserving `WarpState` return types after public snapshot values stop
  being storage values.
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

