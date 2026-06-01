# 0100 Immutable Snapshot Builder Domain Model

- Status: `hill met`
- Release lane: `v17.0.0`
- Source backlog: `IMM_snapshot-builder-domain-model`
- Blocks: `0096-purge-cast-hacks`
- Design role: active METHOD cycle
- Review audience: maintainers and future agents

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

|   Lines | Evidence                                                                                                                              | Classification           |
| ------: | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
|   33-60 | `createReadonlyCollectionProxy<T>(...)` returns a proxy as arbitrary `T`                                                              | Generic preservation lie |
|   66-76 | `cloneImmutableMap<T>(...)` returns `proxy as T`                                                                                      | Generic preservation lie |
|   82-89 | `cloneImmutableSet<T>(...)` returns `proxy as T`                                                                                      | Generic preservation lie |
|  95-101 | `cloneImmutableArray<T>(...)` returns `Object.freeze(cloned) as T`                                                                    | Generic preservation lie |
| 107-125 | `cloneImmutableObject<T>(value: object, ...)` copies descriptors with `Object.create`                                                 | Runtime identity lie     |
|     125 | `Object.freeze(cloned) as unknown as T` is the 0096 cast blocker                                                                      | Cast theater             |
| 131-152 | `cloneImmutableObjectValue<T extends object>(...)` dispatches only one known domain type, then falls back to arbitrary object cloning | Source model gap         |
| 158-175 | `cloneImmutableValue<T>(value: T, ...)` and `createImmutableValue<T>(value: T): T` promise arbitrary preservation                     | Public API lie           |
| 181-182 | `createImmutableWarpState(state): WarpState` delegates to generic `createImmutableValue` instead of a WarpState-specific builder      | Missing snapshot builder |

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

## RED Witness

Command run:

`npx vitest run test/conformance/immutableSnapshotBuilder.test.ts`

Expected failure:

- The source assertions fail because `ImmutableSnapshot.ts` still
  contains generic object cloning, descriptor-copy allocation,
  `as unknown as T`, `createImmutableValue<T>(value: T): T`, `proxy as
T`, `Object.freeze(cloned) as T`, and an arbitrary-object fallback.
- The unsupported-source behavior fails because the current
  `createImmutableValue(...)` path attempts to clone and freeze an
  arbitrary constructor-guarded class instance instead of rejecting it as
  an unsupported snapshot source.
- The receipt-array behavior fails because the current generic snapshot
  path accepts a mixed array containing a non-`TickReceipt` entry.

Main failing categories:

- generic preservation lies;
- descriptor-copy class reconstruction;
- cast theater;
- unsupported source acceptance;
- receipt-array source validation gap.

No production implementation was attempted during RED.

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

## GREEN Witness

Implementation commit:

`c8bf2b71 refactor: replace generic immutable snapshot cloning`

Implementation summary:

- Replaced generic `createImmutableValue<T>(value: T): T` and
  `createImmutableWarpState(...)` with explicit supported-source APIs:
  `createImmutableWarpStateSnapshot(...)` and
  `createImmutableTickReceiptArraySnapshot(...)`.
- Removed descriptor-copy object reconstruction from
  `ImmutableSnapshot.ts`.
- Removed `Object.create` from snapshot construction.
- Removed the `as unknown as T` cast blocker from
  `ImmutableSnapshot.ts`.
- Added runtime guards so unsupported sources fail with an explicit
  unsupported snapshot source error.
- Snapshot construction now handles `WarpState` through known runtime
  structures: `ORSet`, `VersionVector`, `Map`, `Set`, `LWWRegister`, and
  `PropValue`.
- Receipt arrays are copied, frozen, and checked so every entry is a
  real `TickReceipt`.
- Public materialization receipt surfaces now use
  `readonly TickReceipt[]`.
- Removed `src/domain/services/ImmutableSnapshot.ts` from
  `policy/quarantines/0025A-casts.json`.
- Left unrelated 0096 cast families untouched.

Validation:

- `npx vitest run test/conformance/immutableSnapshotBuilder.test.ts`
  passed: 1 file, 5 tests.
- `npx vitest run test/conformance/castQuarantineGraduation.test.ts`
  still fails as expected for non-`ImmutableSnapshot` blockers.
- `npm run typecheck` passed.
- `npm run lint:sludge` passed.
- `git diff --check` passed.
- Targeted materialization/snapshot tests passed:
  `npx vitest run test/unit/domain/services/controllers/MaterializeController.test.ts test/unit/domain/services/controllers/MaterializeController.snapshotCache.test.ts test/unit/domain/services/controllers/MaterializeHelpers.stateSession.test.ts test/unit/domain/services/controllers/StrandController.test.ts test/unit/domain/services/strand/StrandService.test.ts test/unit/domain/WarpCore.snapshotHashStability.test.ts test/unit/domain/WarpGraph.autoMaterialize.test.ts`
  passed: 7 files, 255 tests.

Expected remaining `castQuarantineGraduation.test.ts` blockers:

- Manifest still contains non-0100 files, including `WarpGraph`,
  `MaterializedViewHelpers`, `MaterializedViewService`, `TemporalQuery`,
  `VisibleStateScope`, `StrandController`, `Observer`, `checkpointLoad`,
  `HttpSyncServer`, and `WarpStream`.
- Current double-cast hits remain in `MaterializedViewHelpers`,
  `MaterializedViewService`, `checkpointLoad`, `HttpSyncServer`,
  `TemporalQuery`, `VisibleStateScope`, and `WarpStream`.

Known remaining debt:

- `ImmutableSnapshot.ts` now contains several local read-only collection
  wrapper classes in one file. This is acceptable for the 0100 slice, but
  Playback should check whether those concepts should remain local or be
  split after the snapshot model settles.
- `PropValue` snapshots clone `Uint8Array` values for detachment but do
  not make the returned byte arrays intrinsically immutable. This is not
  a generic clone lie, but it is a read-only-byte limitation worth
  reviewing during Playback.

## Playback Witness

### Agent Playback

Question: Can a future agent tell what an immutable snapshot is a
snapshot of?

Answer: Yes. 0100 defines immutable snapshots as detached, read-only
public read-side values for supported materialization return shapes, not
as arbitrary object clones.

Question: Can a future agent tell which source shapes are supported?

Answer: Yes. The supported source shapes are `WarpState`,
`TickReceipt[]`, and materialization result objects composed from those
values. The implementation exposes explicit builders for `WarpState`
and receipt arrays.

Question: Can a future agent tell that arbitrary `clone<T>() -> T` is
forbidden?

Answer: Yes. The design states that arbitrary `clone<T>() -> T` is
forbidden, and GREEN removed `createImmutableValue<T>(value: T): T`.

Question: Can a future agent tell where unsupported sources fail
explicitly?

Answer: Yes. Unsupported sources fail at the explicit builder boundary:
`createImmutableWarpStateSnapshot(...)` rejects non-`WarpState` sources,
and `createImmutableTickReceiptArraySnapshot(...)` rejects non-array and
non-`TickReceipt` entries.

Question: Can a future agent tell that this cycle chose source-specific
builders rather than a generic protocol?

Answer: Yes. 0100 explicitly chose source-specific builders first and
did not introduce a generic snapshot protocol.

Question: Can a future agent tell that unrelated 0096 blockers remain
untouched?

Answer: Yes. The GREEN witness and this Playback identify that
`castQuarantineGraduation.test.ts` still fails for non-`ImmutableSnapshot`
blockers.

Question: Can a future agent tell that `ImmutableSnapshot.ts` graduated
from the 0025A cast quarantine?

Answer: Yes. GREEN removed `src/domain/services/ImmutableSnapshot.ts`
from `policy/quarantines/0025A-casts.json`, and the remaining expected
cast-quarantine failure no longer lists `ImmutableSnapshot`.

### Human Playback

Question: Can maintainers see why descriptor copying was the root lie?

Answer: Yes. The design explains that descriptor copying through
`Object.create` cannot prove constructor invariants, private field
semantics, behavior preservation, or valid class identity for arbitrary
domain objects.

Question: Is the supported source list narrow enough?

Answer: Yes for this cycle. It includes only the public read-side shapes
already proven by call sites: `WarpState` and receipt arrays.

Question: Is the public return-type honesty clear enough?

Answer: Mostly yes. The cycle made receipt arrays public as
`readonly TickReceipt[]`, which is more honest than returning a frozen
array as mutable `TickReceipt[]`. This is a correct surface change, but
it deserves release-note visibility.

Question: Is it clear what 0100 fixed and what it left for later cycles?

Answer: Yes. 0100 fixed the generic immutable clone lie and the
`ImmutableSnapshot` 0025A cast blocker. It left materialized-view
storage seam casts, snapshot persistence defaults, and any future generic
snapshot protocol for separate cycles.

Question: Is anything still suspicious or underspecified?

Answer: Yes. `PropValue` byte snapshots are detached but not
intrinsically immutable, and the local read-only collection wrappers may
want file/concept splitting later if they grow.

### Immutable Snapshot Repair Check

Repair checks:

- Generic `createImmutableValue<T>(value: T): T` removed: yes.
- Arbitrary descriptor-copy object reconstruction removed: yes.
- `Object.create` removed from `ImmutableSnapshot.ts`: yes.
- `as unknown as T` removed from `ImmutableSnapshot.ts`: yes.
- Unsupported arbitrary class instances rejected: yes.
- Receipt arrays reject non-`TickReceipt` entries: yes.
- `WarpState` snapshots detach from live source mutation: yes.
- Read-only collection behavior preserved for supported snapshots: yes.
- `ImmutableSnapshot.ts` removed from `0025A-casts.json`: yes.

### Remaining 0096 Blockers

`castQuarantineGraduation.test.ts` still fails for non-`ImmutableSnapshot`
blockers.

Remaining cast-hit files/families:

- `MaterializedViewHelpers`
- `MaterializedViewService`
- `checkpointLoad`
- `HttpSyncServer`
- `TemporalQuery`
- `VisibleStateScope`
- `WarpStream`

Stale or non-hit manifest entries also remain in `0025A-casts.json`,
including `WarpGraph`, `StrandController`, and `Observer`. Those entries
are outside 0100 and should be handled by their owning 0096 follow-up
slices.

## Playback Weak Spots

- `ImmutableSnapshot.ts` now has several read-only collection wrapper
  classes in one file.
- `PropValue` snapshots clone `Uint8Array` values but do not make
  returned byte arrays intrinsically immutable.
- The `readonly TickReceipt[]` public surface change may need an API or
  release-note mention.
- The cycle did not address materialized-view storage seam casts.
- The cycle did not address snapshot persistence or default-on policy.
- The cycle did not introduce a generic snapshot protocol by design.

## Drift Check

Question: Did the cycle stay within supported-source immutable snapshot
construction?

Answer: Yes. The implementation repaired only public read-side snapshot
construction for `WarpState` and `TickReceipt[]`. It did not add
arbitrary object snapshotting.

Question: Did it avoid generic snapshot protocol work?

Answer: Yes. GREEN introduced explicit source-specific builders and did
not introduce a broad snapshot protocol.

Question: Did it avoid unrelated 0096 cast families?

Answer: Yes. The implementation did not edit the materialized-view
storage seam, checkpoint loading, HTTP sync, temporal query, visible
state scope, stream, or other non-0100 cast families.

Question: Did GREEN satisfy RED without weakening the test?

Answer: Yes. `immutableSnapshotBuilder.test.ts` now passes. The RED
assertions still check for generic clone/freeze artifacts, descriptor
copying, unsupported source rejection, receipt-array validation, source
detachment, and read-only collection behavior.

Question: Did GREEN introduce necessary adjacent type changes?

Answer: Yes. The repaired receipt snapshot returns
`readonly TickReceipt[]`, so immediate public materialization surfaces
that expose frozen receipt arrays were updated to reflect that readonly
contract.

Question: Were those changes beneficial or harmful?

Answer: Beneficial. The readonly type propagation made the public type
more honest: callers receive frozen receipt arrays and should not treat
them as mutable `TickReceipt[]`.

Question: Is any correction needed before Retrospective?

Answer: No correction is required before Retrospective. The weak spots
are follow-up candidates rather than drift that invalidates 0100.

Drift findings:

- No harmful drift occurred.
- Beneficial drift: `readonly TickReceipt[]` propagated through
  immediate materialization surfaces.
- Beneficial drift: unsupported sources now fail explicitly.
- Beneficial drift: read-only collection behavior is source-specific
  rather than generic clone magic.
- Beneficial drift: remaining participant-specific wording in the
  original PULL playback question list was made actor-neutral.
- Expected remaining failure: `castQuarantineGraduation.test.ts` still
  fails for non-0100 blockers.

Follow-up candidates for Retrospective:

- `IMM_snapshot-readonly-collection-wrapper-split`
- `IMM_readonly-byte-propvalue-snapshot`
- `API_readonly-receipts-release-note`

Only the receipt-array public surface note appears release-relevant
enough to consider as a separate backlog card. The wrapper split and
readonly byte-array limitation look like future hardening unless
Retrospective finds they are active blockers.

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

- Can maintainers see why descriptor copying is the root lie?
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

## Cycle End

Closeout links:

- Retrospective:
  [docs/method/retros/0100-immutable-snapshot-builder-domain-model.md](../method/retros/0100-immutable-snapshot-builder-domain-model.md)
- Release-note follow-up:
  [docs/method/backlog/v17.0.0/API_readonly-receipts-release-note.md](../archive/backlog/v17.0.0-residual-backlog/API_readonly-receipts-release-note.md)

Cycle-end confirmations:

- 0100 repaired the immutable snapshot root lie.
- `immutableSnapshotBuilder.test.ts` passes.
- Targeted materialization and snapshot tests pass.
- `npm run typecheck` passes.
- `npm run lint:sludge` passes.
- `castQuarantineGraduation.test.ts` still fails for non-0100 blockers.
- `0096-purge-cast-hacks` remains blocked.
- Next recommended cycle is `IDX_property-reader-capability-port`.

Expected remaining non-0100 cast blockers:

- `MaterializedViewHelpers`
- `MaterializedViewService`
- `checkpointLoad`
- `HttpSyncServer`
- `TemporalQuery`
- `VisibleStateScope`
- `WarpStream`
