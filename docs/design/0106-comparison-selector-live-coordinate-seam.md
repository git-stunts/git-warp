# 0106 Comparison Selector Live Coordinate Seam

- Status: `PULL`
- Release lane: `v17.0.0`
- Source: `SLUDGE_comparison-selector-live-coordinate-seam`
- Design role: narrow seam extraction design
- Review audience: maintainers and future agents

## Hill

Design the first `ComparisonSelector` seam extraction for live and
coordinate comparison-side resolution only.

The target is not to fix all comparison sludge. The target is to remove
the broad `ComparisonHost` dependency thinking from live and coordinate
selector resolution and replace it with a narrow, comparison-owned read
or coordinate seam.

This PULL does not edit production code, start RED, touch strand
comparison, split files mechanically, create backlog cards, edit
`RuntimeHost`, edit `index.ts`, resume 0096, add the anti-sludge hook, or
push.

## Scope

In scope:

- live selector side resolution
- coordinate selector side resolution
- frontier normalization needed by those selectors
- patch entries needed to finalize those sides
- state hash and digest dependency shape used during side finalization
- test evidence for the current host-shaped seam

Out of scope:

- strand selector resolution
- strand-base selector resolution
- `createStrandCoordinator`
- `callInternalRuntimeMethod`
- `materializeStrand`
- transfer planning
- public package-root exports
- broad `RuntimeHost` cleanup
- mechanical class-per-file splitting
- 0096 cast-family cleanup

## Evidence Inspected

Files inspected:

- `src/domain/services/controllers/ComparisonSelector.ts`
- `src/domain/services/controllers/ComparisonController.ts`
- `src/domain/services/controllers/ComparisonEngine.ts`
- `src/domain/services/CoordinateFactExport.ts`
- `src/domain/types/CoordinateComparison.ts`
- `src/domain/RuntimeHost.ts`
- `test/unit/domain/services/controllers/ComparisonController.test.ts`
- `docs/design/0104-sludge-sleuth-screening-and-survey.md`
- `docs/design/0105-runtimehost-query-materialization-port-seam.md`

Graft path-scoped probe on `ComparisonSelector.ts` reported:

- `12` candidate sludge signals
- score `15`
- `554` lines
- `46` structural outline entries
- `5` classes
- `25` functions
- `9` free-function-data-behavior signals
- `2` homeless-constructor signals

The Graft count is candidate telemetry, not automatic guilt. Manual
inspection confirms the file is a real seam candidate because it mixes
selector validation, selector runtime classes, coordinate materialization
access, patch frontier analysis, strand metadata construction, state
hashing, scope projection, digest construction, and response assembly.

## Current Shape

`ComparisonController` stores one dependency:

```ts
_host: ComparisonHost;
```

`compareCoordinates()` delegates to `compareCoordinatesImpl(this._host,
options)`.

`compareCoordinatesImpl()` normalizes both selectors, optionally reads
the live frontier, resolves left and right sides, computes patch
divergence, compares visible state, builds a comparison fact, and hashes
the result.

`LiveComparisonSelector.resolve()` currently needs:

- a live frontier, or a way to read it once for both sides
- a coordinate state for that frontier and optional ceiling
- patch entries for that frontier and optional ceiling
- side finalization

`CoordinateComparisonSelector.resolve()` currently needs:

- a normalized coordinate frontier
- a coordinate state for that frontier and optional ceiling
- patch entries for that frontier and optional ceiling
- side finalization

Both live and coordinate selectors call through `ComparisonHost`, whose
current surface is too broad:

```ts
getFrontier(): Promise<Map<string, string>>;
_materializeCoordinateGraph(opts: MaterializeCoordinateOptions): Promise<ComparisonMaterializedState>;
_loadPatchChainFromSha(sha: string): Promise<PatchEntry[]>;
_crypto: CryptoPort;
_codec: CodecPort;
_blobStorage: { retrieve(oid: string): Promise<Uint8Array> } | null;
_persistence: { readBlob(oid: string): Promise<Uint8Array> };
_stateHashService: { compute(state: WarpState): Promise<string> } | null;
```

For live and coordinate comparison-side resolution, `_blobStorage` and
`_persistence` are not legitimate dependencies. They are transfer-plan
content-loading dependencies and should not be in the first live or
coordinate selector seam.

The strand fields and paths are also not part of the first seam. They
remain separate because strand comparison currently pulls in
`createStrandCoordinator`, `callInternalRuntimeMethod`, and strand
materialization.

## Current Test Evidence

The existing targeted test file is already red against the current
source:

```sh
npx vitest run test/unit/domain/services/controllers/ComparisonController.test.ts
```

Observed result during PULL:

- `61` tests discovered
- `31` passed
- `30` failed
- primary failure: `TypeError: graph._materializeCoordinateGraph is not a function`

The fixture creates `materializeCoordinate`, but production source calls
`_materializeCoordinateGraph`. This is not the RED for this cycle, but it
is useful evidence: tests and source disagree on the comparison
materialization seam name and shape.

The future RED should not simply add `_materializeCoordinateGraph` to the
test fixture. That would bless the host-shaped seam. RED should require
live and coordinate side resolution to use a narrow comparison seam
instead.

## Legitimate Dependencies

Live and coordinate side resolution legitimately need:

- current live frontier when at least one side is `live`
- coordinate materialization for a requested frontier and ceiling
- patch entries for each frontier tip, filtered by ceiling
- visible-scope projection
- state hash for the scoped state
- deterministic checksums for visible patch frontier, lamport frontier,
  and patch universe digests

Those needs do not justify exposing persistence, blob storage, strand
coordination, generic runtime host methods, or public graph APIs to the
selector classes.

## RuntimeHost Leakage

Confirmed leakage:

- `_materializeCoordinateGraph` is a private-ish runtime/materialization
  method name embedded in selector resolution.
- `_loadPatchChainFromSha` is a patch controller seam exposed through
  `ComparisonHost`.
- `_crypto`, `_codec`, and `_stateHashService` are dependency fields
  leaked through the same host bag.
- `_blobStorage` and `_persistence` are unrelated to live/coordinate
  side resolution but ride along on the same host surface.

This is interface-segregation sludge. A selector that resolves a
coordinate comparison side should not receive a runtime-shaped octopus.

## Proposed Seam Direction

Preferred PULL target:

```txt
ComparisonCoordinateReadPort
```

Likely responsibilities:

```ts
liveFrontier(): Promise<ComparisonFrontier>;
readCoordinateSide(request: ComparisonCoordinateSideRequest): Promise<ComparisonCoordinateSideRead>;
```

Where the named concepts should carry the repeated shapes:

- `ComparisonFrontier`
- `ComparisonCoordinateSideRequest`
- `ComparisonCoordinateSideRead`
- `ComparisonPatchEntry`
- `ComparisonSideDigestPort`, if digest/state-hash dependencies need a
  separate reason to change

The exact names can change during RED/GREEN if evidence proves better
ones. The required property is narrow ownership, not these spellings.

The seam may need to split into two ports:

- `ComparisonCoordinateReadPort` for live frontier and coordinate state
  reads.
- `ComparisonPatchFrontierPort` for patch entries and frontier
  projections.

That split is plausible because materializing a coordinate state and
deriving patch/frontier metadata are different reasons to change. RED
should decide whether one narrow port is still honest or whether two
ports are required.

Rejected names:

- `RuntimePort`
- `RuntimeFacade`
- `GraphPort`
- `ComparisonManager`
- `ComparisonRuntimeManager`
- `ComparisonHelper`
- `ComparisonRuntimeFacade`
- anything `Like`

## ResolvedComparisonSide Ownership

`ResolvedComparisonSide` is a real runtime value object candidate. It has
state, patch entries, requested side, resolved side, and constructor
freezing.

It should probably become its own file during GREEN if the live/coordinate
seam needs to import it across modules. That movement should be ownership
driven, not mechanical file splitting.

Do not split all selector classes just because there are five exported
classes today. Split only when the next seam needs a new owner and a
clear file boundary.

## Frontier Projection Ownership

Frontier projection is repeated and important:

- normalize frontier record
- convert frontier record to map
- derive patch frontier from patch entries
- derive lamport frontier from patch entries
- derive unique sorted patch SHAs

This probably wants a named owner later. It does not have to be extracted
in the first GREEN unless the RED proves the seam otherwise repeats the
same shape.

Do not create `comparisonHelpers.ts`, `frontierUtils.ts`, or
`selectorUtils.ts`. If extracted, name the concept.

## RED Direction

RED should prove the current live/coordinate selector seam is too broad.

Required RED constraints:

- `LiveComparisonSelector` and `CoordinateComparisonSelector` must not
  depend on `ComparisonHost`.
- live and coordinate selector resolution must not reference
  `_materializeCoordinateGraph`.
- live and coordinate selector resolution must not reference
  `_loadPatchChainFromSha`.
- live and coordinate selector resolution must not require `_blobStorage`
  or `_persistence`.
- tests must not make the suite green by adding host-bag fields to the
  fixture.
- `compareCoordinates()` public API must remain unchanged.
- strand selector resolution must be explicitly excluded from the RED
  unless a separate strand seam is pulled.

Possible RED artifact:

```txt
test/conformance/comparisonLiveCoordinateSeam.test.ts
```

The test should inspect source shape and/or instantiate live and
coordinate resolution through a fake narrow seam. It should fail today
because current selectors still resolve through `ComparisonHost`.

The existing red `ComparisonController.test.ts` is useful evidence but
not sufficient as the seam RED. It fails because the fixture is stale,
not because it encodes the desired narrow seam.

## GREEN Direction

GREEN should remove one seam without creating a new god facade:

- introduce a narrow comparison coordinate read seam;
- have live and coordinate selector resolution depend on that seam;
- keep `compareCoordinates()` public API stable;
- keep strand resolution behavior out of scope;
- keep transfer content loading out of the live/coordinate selector
  seam;
- update `ComparisonController.test.ts` honestly so its fixture models
  the new seam, not `_materializeCoordinateGraph`;
- preserve existing behavior around live frontier caching, frontier
  sorting, lamport ceiling, scope, patch divergence, state hash, and
  digest fields.

If implementation cannot isolate live/coordinate resolution without
touching strand comparison, stop and mark GREEN blocked. Do not drag the
strand basement into this slice.

## Public API

Public APIs must not change in this cycle:

- `compareCoordinates(options)`
- `compareStrand(strandId, options?)`
- `planCoordinateTransfer(options)`
- `planStrandTransfer(strandId, options?)`
- coordinate comparison result shape
- package-root exports

If RED proves a public type is wrong, stop and update the design before
GREEN. Do not sneak a public API change into a seam cleanup.

## Non-Goals

- No whole-file demolition.
- No mechanical class splitting.
- No strand seam work.
- No `RuntimeHost` rewrite.
- No root export changes.
- No helper or utility dumping ground.
- No broad comparison transfer planning cleanup.
- No 0096 cast cleanup.
- No pre-commit hook work.

## PULL Answers

1. Live comparison side resolution needs a live frontier, coordinate
   state for that frontier and ceiling, patch entries for that frontier,
   and side finalization.
2. Coordinate comparison side resolution needs a normalized frontier,
   coordinate state for that frontier and ceiling, patch entries for that
   frontier, and side finalization.
3. Legitimate dependencies are live frontier read, coordinate state read,
   patch-entry read, state hash, checksum, and scope projection.
4. RuntimeHost leakage includes `_materializeCoordinateGraph`,
   `_loadPatchChainFromSha`, `_crypto`, `_codec`, `_stateHashService`,
   `_blobStorage`, and `_persistence` riding together on
   `ComparisonHost`.
5. Live/coordinate extraction appears possible without touching strand
   comparison if RED excludes strand selectors and GREEN routes only
   live/coordinate selectors through the new seam.
6. `ResolvedComparisonSide` should likely become its own runtime
   object/file if imported across the extracted seam.
7. Frontier projection should remain local for the first slice unless
   RED/GREEN would otherwise duplicate its shape. It is a likely follow-up
   owner, not a helper landfill.
8. RED should prove live/coordinate selectors depend on a host-shaped
   seam and private-ish materialization method today.
9. GREEN should introduce a narrow comparison coordinate read seam and
   update tests to model that seam without touching public APIs.

## Validation

PULL inspection commands run:

```sh
npx vitest run test/unit/domain/services/controllers/ComparisonController.test.ts
```

Result: failed as evidence above. This PULL does not repair it.

Required doc validation before committing this PULL:

```sh
npx markdownlint docs/design/0106-comparison-selector-live-coordinate-seam.md
git diff --check
```

## SLUDGE STRIKER SUMMARY

### 1. Sludge Encountered

- Pattern: broad comparison host bag.
  Files: `src/domain/services/controllers/ComparisonSelector.ts`.
  Why it is sludge: live/coordinate selector resolution receives
  materialization, patch loading, crypto, codec, persistence, blob
  storage, and state-hash service through one host-shaped dependency.
  Status: PULL-scoped, not fixed.
- Pattern: private runtime seam leakage.
  Files: `src/domain/services/controllers/ComparisonSelector.ts`,
  `src/domain/RuntimeHost.ts`.
  Why it is sludge: `_materializeCoordinateGraph` and
  `_loadPatchChainFromSha` are internal machinery exposed as selector
  dependencies.
  Status: PULL-scoped, not fixed.
- Pattern: test fixture seam drift.
  Files: `test/unit/domain/services/controllers/ComparisonController.test.ts`.
  Why it is sludge: the test fixture exposes `materializeCoordinate`
  while current source calls `_materializeCoordinateGraph`, so the suite
  is red for seam-name drift rather than a deliberate architecture RED.
  Status: surfaced, not fixed.
- Pattern: strand scope trap.
  Files: `src/domain/services/controllers/ComparisonSelector.ts`.
  Why it is sludge: strand comparison pulls in `createStrandCoordinator`
  and `callInternalRuntimeMethod`, which would explode the first seam.
  Status: rejected from this cycle.

### 2. Sludge Fixed

No production or test sludge was fixed. This is a PULL-only design
artifact.

### 3. Sludge Rejected

- Rejected whole-file demolition.
- Rejected mechanical class splitting.
- Rejected `RuntimeHost` rewrite.
- Rejected strand comparison in the first seam.
- Rejected facade, manager, helper, utility, and `*Like` names.
- Rejected making stale tests green by adding more host-bag fields.

### 4. Sludge Deferred / Tracked

- Strand comparison seam remains future work.
- Transfer planning content-loading dependencies remain future work.
- Frontier projection ownership remains a likely follow-up.
- Public `CoordinateComparison` type-model sludge remains outside this
  PULL.

### 5. Anti-Sludge Checks Actually Run

- Graft path-scoped doctor on `ComparisonSelector.ts`.
- Targeted source inspection of comparison selector, controller, engine,
  fact export, coordinate comparison types, RuntimeHost seams, and
  comparison tests.
- `npx vitest run
  test/unit/domain/services/controllers/ComparisonController.test.ts`
  failed with `30` existing seam-drift failures.

### 6. Remaining Risk

Remaining risk: `ComparisonSelector.ts` is tempting to overcut. The next
turn must start with RED for live/coordinate selector resolution only.
If strand comparison, transfer planning, or RuntimeHost cleanup enters
the slice, the cycle is no longer narrow.
