# 0100 Immutable Snapshot Builder Domain Model

- Status: `PULL`
- Release lane: `v17.0.0`
- Source backlog: `IMM_snapshot-builder-domain-model`
- Blocks: `0096-purge-cast-hacks`
- Sponsor human: James Ross
- Sponsor agent: Codex

## Hill

git-warp replaces the generic immutable clone helper with explicit
snapshot construction for supported public read-side return shapes, so
`0096-purge-cast-hacks` can remove the `ImmutableSnapshot` cast without
pretending arbitrary runtime objects survive descriptor-copy cloning.

## Why This Exists

`src/domain/services/ImmutableSnapshot.ts` currently says that any
arbitrary `T` can be recursively cloned, frozen, and returned as the
same `T`.

That is not runtime-honest. Copying object descriptors through
`Object.create` does not prove constructor invariants, private field
semantics, behavior preservation, or valid class identity for arbitrary
domain objects.

The bad part is not just the visible `as unknown as T`. The cast is a
symptom of a missing noun: git-warp needs an explicit snapshot builder
for the public read-side values it actually returns.

## Source Card

Pulled from:

`docs/method/backlog/bad-code/IMM_snapshot-builder-domain-model.md`

The source card said:

- stop promising generic preservation for arbitrary `T`;
- introduce an explicit snapshot builder or immutable snapshot value;
- preserve domain objects only through constructors or an explicit
  snapshot protocol;
- keep collection read-only behavior as part of the snapshot model;
- cover read-only `Map` and `Set` behavior, cycles, `VersionVector`, and
  domain object invariants.

## Current Evidence

### `src/domain/services/ImmutableSnapshot.ts`

| Lines | Evidence | Classification |
|---:|---|---|
| 33-60 | `createReadonlyCollectionProxy<T>(...)` returns a proxy as arbitrary `T` | Generic preservation lie |
| 66-76 | `cloneImmutableMap<T>(...)` returns `proxy as T` | Generic preservation lie |
| 82-89 | `cloneImmutableSet<T>(...)` returns `proxy as T` | Generic preservation lie |
| 95-101 | `cloneImmutableArray<T>(...)` returns `Object.freeze(cloned) as T` | Generic preservation lie |
| 107-125 | `cloneImmutableObject<T>(value: object, ...)` copies descriptors with `Object.create` | Runtime identity lie |
| 125 | `Object.freeze(cloned) as unknown as T` is the 0096 cast blocker | Cast theater |
| 131-152 | `cloneImmutableObjectValue<T extends object>(...)` dispatches only one known domain type, then falls back to arbitrary object cloning | Source model gap |
| 158-175 | `cloneImmutableValue<T>(value: T, ...)` and `createImmutableValue<T>(value: T): T` promise arbitrary preservation | Public API lie |
| 181-182 | `createImmutableWarpState(state): WarpState` delegates to generic `createImmutableValue` instead of a WarpState-specific builder | Missing snapshot builder |

### Current Call Sites

Current production call sites use the helper for two concrete public
read-side shapes:

- `WarpState`, via `createImmutableWarpState(...)`.
- materialization receipt arrays, via `createImmutableValue(receipts)`.

Known call sites:

- `src/domain/RuntimeHost.ts`
- `src/domain/services/controllers/MaterializeHelpers.ts`
- `src/domain/services/controllers/QueryReads.ts`
- `src/domain/services/strand/StrandCoordinator.ts`

There is no evidence that git-warp needs arbitrary object snapshotting
as a domain capability.

## Snapshot Subject Decision

An immutable snapshot is a detached, read-only public read-side value
created from a supported materialization result shape.

Supported sources for this cycle:

- `WarpState`
- `TickReceipt[]`
- materialization result objects containing `state: WarpState` and
  `receipts: TickReceipt[]`

Supported nested structures are implementation details of those sources:

- `ORSet` instances inside `WarpState`
- `VersionVector` inside `WarpState`
- `Map` and `Set` collections inside supported sources
- arrays of immutable receipt values

Unsupported sources must fail explicitly. They must not be descriptor
copied, prototype copied, or silently frozen as if their invariants were
preserved.

## Forbidden Claim

Arbitrary `clone<T>() -> T` is forbidden.

The snapshot builder must not claim that it can preserve arbitrary class
instances, private fields, constructors, prototype behavior, or domain
invariants through descriptor copying.

If a new source wants snapshot support, it must become one of:

- a source-specific snapshot builder;
- a constructor-backed snapshot path on the owning domain type;
- an explicit snapshot protocol approved by a future design.

Do not introduce a generic protocol in 0100 just to keep `T` alive.

## Proposed Domain Nouns

### `ImmutableSnapshotBuilder`

Owner: domain.

Purpose: source-specific builder for public read-side immutable
snapshots.

Responsibilities:

- build detached snapshots only for supported source types;
- route `WarpState` through a WarpState-specific snapshot path;
- route receipt arrays through a TickReceipt-array snapshot path;
- create read-only collection views only as part of supported source
  snapshotting;
- fail explicitly for unsupported sources.

Non-responsibilities:

- no arbitrary object cloning;
- no descriptor-copy class reconstruction;
- no generic `T` preservation promise;
- no transport/wire decoding.

### `WarpStateSnapshot`

Owner: domain.

Purpose: names the public read-side snapshot semantics of materialized
state.

Implementation decision for GREEN:

- Prefer a runtime-backed value if the current public API can accept the
  breaking type correction in v17.
- If immediate public type replacement is too wide for one slice, the
  minimum acceptable GREEN must still build from `WarpState.clone()` and
  supported collection snapshot paths, not from arbitrary object cloning.

Invariant:

- The snapshot is detached from the source `WarpState`.
- Mutating the live source after snapshot construction cannot mutate the
  snapshot.
- Normal public mutation attempts on snapshot collections throw a
  domain error.

### `TickReceiptArraySnapshot`

Owner: domain.

Purpose: names the supported snapshot source for receipt arrays.

Invariant:

- The array is copied and frozen.
- Entries are already immutable `TickReceipt` instances or are rejected.
- The builder does not recursively copy arbitrary receipt-shaped
  objects.

### `UnsupportedSnapshotSource`

Owner: domain.

Purpose: explicit failure for unsupported snapshot source values.

Invariant:

- callers get an expected domain failure instead of a fake clone.
- no arbitrary class instance is copied with `Object.create`.

The final name may be a `WarpError` subtype or a result variant,
depending on local error patterns discovered during GREEN.

## Protocol Decision

0100 should be source-specific first, not protocol-first.

Reason: the only proven source families are materialized `WarpState` and
receipt arrays. A generic snapshot protocol would risk recreating the
same broad promise under a cleaner name.

Future protocol support is allowed only if a later cycle proves multiple
owned domain types need to opt into snapshot construction. That protocol
must state:

- who owns the snapshot method;
- what invariants the source proves;
- what type the snapshot returns;
- how cycles are handled;
- why it is not arbitrary `clone<T>()`.

## RED Plan

Add `test/conformance/immutableSnapshotBuilder.test.ts`.

The RED should prove the current generic clone/freeze lie exists. It
should fail while `ImmutableSnapshot.ts` still contains:

- `function cloneImmutableObject<T>(value: object`;
- `Object.create`;
- `as unknown as T`;
- `createImmutableValue<T>(value: T): T`;
- generic helper returns such as `proxy as T` or `Object.freeze(...) as
  T`;
- fallback cloning for arbitrary objects after known types are checked.

Add behavioral RED coverage for unsupported sources:

- define a local class with private state or constructor-established
  invariants;
- pass an instance through the current snapshot path;
- assert that the repaired design must reject it explicitly rather than
  descriptor-copying it.

Add behavioral RED coverage for supported sources:

- `WarpState` snapshots are detached from the source;
- `Map` and `Set` members in supported snapshots reject mutation;
- cyclic supported collection graphs do not recurse forever;
- `VersionVector` is cloned through its own runtime behavior, not
  descriptor copying;
- receipt arrays are copied/frozen and reject non-`TickReceipt`
  entries.

The RED must not inspect arbitrary future adapter files. Scope it to
`src/domain/services/ImmutableSnapshot.ts` and the public snapshot API
surface that replaces it.

Expected RED result:

- source conformance fails because generic clone helpers and
  `as unknown as T` remain;
- unsupported-source behavior fails because current code attempts to
  preserve arbitrary objects.

## GREEN Plan

Repair in dependency order:

1. Introduce source-specific snapshot construction for `WarpState`.
2. Introduce source-specific snapshot construction for `TickReceipt[]`.
3. Replace `createImmutableValue<T>(value: T): T` call sites with
   explicit supported-source functions.
4. Remove arbitrary descriptor-copy object cloning.
5. Remove `Object.create` from snapshot construction.
6. Remove `as unknown as T` from `ImmutableSnapshot.ts`.
7. Ensure unsupported sources fail explicitly.
8. Keep read-only `Map` and `Set` behavior, but only inside supported
   source snapshot construction.
9. Update 0025A cast quarantine for the `ImmutableSnapshot` entry only.
10. Keep unrelated 0096 blockers untouched.

Implementation constraints:

- no `any`;
- no `as any`;
- no `as unknown as`;
- no `unknown` in domain code unless existing local debt is removed by
  the same slice;
- no `Record<string, unknown>`;
- no `*Like` models;
- no generic `clone<T>() -> T`;
- no descriptor-copy reconstruction of arbitrary class instances.

## Playback Questions

### Agent

- Can a future agent tell what an immutable snapshot is a snapshot of?
- Can a future agent tell which source shapes are supported?
- Can a future agent tell that arbitrary `clone<T>() -> T` is forbidden?
- Can a future agent tell where unsupported sources must fail?
- Can a future agent tell whether snapshotting is source-specific,
  constructor-based, or protocol-based for this cycle?
- Can a future agent derive RED tests directly from this design?
- Can a future agent avoid fixing unrelated 0096 cast families?

### Human

- Can James see why descriptor copying is the root lie?
- Is the supported source list narrow enough?
- Is the public return-type honesty question visible enough to approve
  or challenge during GREEN?
- Is it clear what 0100 fixes and what it leaves for later cycles?
- Is anything still too generic or likely to become snapshot cosplay?

## Drift Risks

- Keeping `createImmutableValue<T>(value: T): T` under a new name.
- Replacing `as unknown as T` with many narrower-looking casts.
- Creating `SnapshotLike`, `SnapshotData`, or other vague bag names.
- Adding a broad snapshot protocol before there is evidence for it.
- Returning mutable `WarpState` while calling it immutable in comments.
- Breaking public materialization API types without an explicit decision.
- Expanding the cycle into materialization snapshot persistence defaults.
- Touching unrelated cast-quarantine families from 0096.

## Edge Cases

- `WarpState` contains nested CRDT structures that need detached
  snapshots.
- `VersionVector` uses private state and must be cloned through its own
  runtime behavior.
- Collection cycles need cycle tracking without reintroducing arbitrary
  object preservation.
- Receipt arrays are supported, but arbitrary receipt-shaped objects are
  not.
- A read-only proxy can block normal public mutation attempts, but it is
  not a proof that an arbitrary object was faithfully cloned.
- This cycle concerns in-memory read-side snapshots, not external-memory
  streaming materialization.

## Known Failure Modes

- Treating `Object.freeze` as an invariant proof.
- Treating `Object.create(proto)` as constructor preservation.
- Treating descriptor copy as private-state preservation.
- Making `ImmutableSnapshot<T>` a generic box around arbitrary values.
- Leaving `createImmutableValue<T>` as a compatibility seam.
- Hiding unsupported sources behind silent best-effort cloning.
- Letting this cycle drift into snapshot persistence policy defaults.

## Non-Goals

- Do not resume all of `0096-purge-cast-hacks`.
- Do not fix materialized-view storage-port casts in this cycle.
- Do not fix property-index reader casts in this cycle.
- Do not change snapshotting default-on policy in this cycle.
- Do not introduce streaming snapshot persistence.
- Do not create a generic snapshot protocol unless RED/GREEN discovers a
  real source-specific need that cannot be solved locally.
- Do not preserve arbitrary class instances through descriptor copying.
