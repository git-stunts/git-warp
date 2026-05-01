# 0106 Comparison Selector Coordinate-Backed Side Seam

- Status: `RED`
- Release lane: `v17.0.0`
- Source: `SLUDGE_comparison-selector-live-coordinate-seam`
- Design role: narrow seam extraction design
- Review audience: maintainers and future agents

## Hill

Design the first `ComparisonSelector` seam extraction for
coordinate-backed comparison side resolution.

The target is not to fix all comparison sludge. The target is to remove
the broad `ComparisonHost` dependency thinking from selectors that
resolve coordinate-backed comparison sides and replace it with a narrow,
comparison-owned read or coordinate seam.

This PULL/RED correction does not edit production code, start GREEN,
touch full strand overlay comparison, split files mechanically, create
backlog cards, edit `RuntimeHost`, edit `index.ts`, resume 0096, add the
anti-sludge hook, or push.

## Scope

In scope:

- live selector side resolution
- coordinate selector side resolution
- strand-base selector side resolution
- frontier normalization needed by those selectors
- patch entries needed to finalize those sides
- state hash and digest dependency shape used during side finalization
- test evidence for the current host-shaped seam

Out of scope:

- full strand overlay selector resolution
- `createStrandCoordinator`
- `callInternalRuntimeMethod`
- `materializeStrand`
- transfer planning
- public package-root exports
- broad `RuntimeHost` cleanup
- mechanical class-per-file splitting
- 0096 cast-family cleanup

`StrandBaseComparisonSelector` is now in scope because it resolves a
base coordinate side. That is coordinate-backed side resolution, not full
strand overlay materialization. `StrandComparisonSelector` remains out of
scope because it still owns full strand overlay comparison and currently
uses separate strand machinery.

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

`StrandBaseComparisonSelector.resolve()` currently needs:

- a strand descriptor or equivalent base coordinate metadata
- the strand base frontier
- a coordinate state for that base frontier and optional ceiling
- patch entries for that base frontier and optional ceiling
- side finalization

These needs make strand-base coordinate-backed. They do not require full
strand overlay materialization.

Live, coordinate, and strand-base selectors call through
`ComparisonHost`, whose current surface is too broad:

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

For coordinate-backed comparison-side resolution, `_blobStorage` and
`_persistence` are not legitimate dependencies. They are transfer-plan
content-loading dependencies and should not be in the first
coordinate-backed selector seam.

Full strand overlay comparison remains separate because
`StrandComparisonSelector` currently pulls in `createStrandCoordinator`,
`callInternalRuntimeMethod`, and strand materialization. Strand-base is
not full strand overlay comparison; it should receive only the narrow
base-coordinate read seam it needs.

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
coordinate-backed side resolution to use a narrow comparison seam
instead. The fixture failure also showed that strand-base behavior uses
the same coordinate-backed materialization path, so strand-base is now
explicitly in scope.

## RED Witness

RED artifact:

```txt
test/conformance/comparisonLiveCoordinateSeam.test.ts
```

The RED is deliberately separate from the existing
`ComparisonController.test.ts` failure. The existing failure proves
fixture/source seam drift. The conformance RED proves the architecture
fence:

- `LiveComparisonSelector` must not depend on broad `ComparisonHost`.
- `CoordinateComparisonSelector` must not depend on broad
  `ComparisonHost`.
- `StrandBaseComparisonSelector` must not depend on broad
  `ComparisonHost` for coordinate-backed side materialization.
- coordinate-backed selector resolution must not reference
  `_materializeCoordinateGraph`.
- coordinate-backed selector resolution must not reference
  `_loadPatchChainFromSha`.
- coordinate-backed selector resolution must not require `_blobStorage` or
  `_persistence`.
- `StrandComparisonSelector` remains out of scope and may still use
  existing strand machinery until a separate seam owns it.
- coordinate-backed selector resolution must not route through
  `strandCoordinatorFor`, `createStrandCoordinator`,
  `callInternalRuntimeMethod`, or `materializeStrand`.
- rejected seam names such as `RuntimePort`, `RuntimeFacade`,
  `GraphPort`, `ComparisonManager`, `ComparisonRuntimeManager`,
  `ComparisonHelper`, and placeholder suffix names are not acceptable.

Expected result before GREEN:

```sh
npx vitest run test/conformance/comparisonLiveCoordinateSeam.test.ts
```

Result during original RED: failed, as expected:

- `7` conformance tests discovered
- `4` passed
- `3` failed
- failing assertions are the original live/coordinate host-bag fence:
  `ComparisonHost`, `_materializeCoordinateGraph`, and related private
  runtime/storage seams are still present in the scanned live/coordinate
  selector source

Result during corrected RED: failed, as expected:

- `8` conformance tests discovered
- `4` passed
- `4` failed
- failing assertions are the intended coordinate-backed host-bag fence:
  `LiveComparisonSelector`, `CoordinateComparisonSelector`, and
  `StrandBaseComparisonSelector` still depend on `ComparisonHost`,
  `_materializeCoordinateGraph`, and related private runtime/storage
  seams

The corrected RED expands the fence to coordinate-backed side resolution,
including `StrandBaseComparisonSelector`. The failure is the fence. GREEN
must remove the coordinate-backed host-bag dependency by introducing a
narrow comparison-owned seam. GREEN must not make the RED pass by adding
`_materializeCoordinateGraph` to the stale controller fixture, renaming
`ComparisonHost`, or creating a generic facade.

## Legitimate Dependencies

Coordinate-backed side resolution legitimately needs:

- current live frontier when at least one side is `live`
- coordinate materialization for a requested frontier and ceiling
- patch entries for each frontier tip, filtered by ceiling
- strand base coordinate metadata when the requested side is
  `strand_base`
- visible-scope projection
- state hash for the scoped state
- deterministic checksums for visible patch frontier, lamport frontier,
  and patch universe digests

Those needs do not justify exposing persistence, blob storage, strand
coordination, generic runtime host methods, or public graph APIs to the
selector classes. If strand-base needs a strand descriptor, that should
enter through a narrow coordinate-backed side seam, not by giving the
selector full strand coordination machinery.

## RuntimeHost Leakage

Confirmed leakage:

- `_materializeCoordinateGraph` is a private-ish runtime/materialization
  method name embedded in selector resolution.
- `_loadPatchChainFromSha` is a patch controller seam exposed through
  `ComparisonHost`.
- `_crypto`, `_codec`, and `_stateHashService` are dependency fields
  leaked through the same host bag.
- `_blobStorage` and `_persistence` are unrelated to coordinate-backed
  side resolution but ride along on the same host surface.
- `strandCoordinatorFor` drags strand coordination into
  `StrandBaseComparisonSelector` even though strand-base only needs base
  coordinate metadata and coordinate-backed side resolution.

This is interface-segregation sludge. A selector that resolves a
coordinate-backed comparison side should not receive a runtime-shaped
octopus.

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

`ComparisonCoordinateSideRequest` must be capable of representing live,
coordinate, and strand-base coordinate-backed reads without becoming a
generic host bag. It must not absorb full strand overlay comparison,
transfer planning, persistence, or blob storage.

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

It should probably become its own file during GREEN if the
coordinate-backed seam needs to import it across modules. That movement
should be ownership driven, not mechanical file splitting.

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

RED should prove the current coordinate-backed selector seam is too
broad.

Required RED constraints:

- `LiveComparisonSelector`, `CoordinateComparisonSelector`, and
  `StrandBaseComparisonSelector` must not depend on `ComparisonHost`.
- coordinate-backed selector resolution must not reference
  `_materializeCoordinateGraph`.
- coordinate-backed selector resolution must not reference
  `_loadPatchChainFromSha`.
- coordinate-backed selector resolution must not require `_blobStorage`
  or `_persistence`.
- coordinate-backed selector resolution must not route through
  `strandCoordinatorFor`, `createStrandCoordinator`,
  `callInternalRuntimeMethod`, or `materializeStrand`.
- tests must not make the suite green by adding host-bag fields to the
  fixture.
- `compareCoordinates()` public API must remain unchanged.
- full `StrandComparisonSelector` overlay resolution must be explicitly
  excluded from the RED unless a separate strand seam is pulled.

Possible RED artifact:

```txt
test/conformance/comparisonLiveCoordinateSeam.test.ts
```

The test should inspect source shape and/or instantiate coordinate-backed
resolution through a fake narrow seam. It should fail today because
current selectors still resolve through `ComparisonHost`.

The existing red `ComparisonController.test.ts` is useful evidence but
not sufficient as the seam RED. It fails because the fixture is stale,
not because it encodes the desired narrow seam.

## GREEN Direction

GREEN should remove one seam without creating a new god facade:

- introduce a narrow comparison coordinate read seam;
- have live, coordinate, and strand-base selector resolution depend on
  that seam;
- keep `compareCoordinates()` public API stable;
- keep full strand overlay resolution behavior out of scope;
- keep transfer content loading out of the coordinate-backed selector
  seam;
- update `ComparisonController.test.ts` honestly so its fixture models
  the new seam, not `_materializeCoordinateGraph`;
- preserve existing behavior around live frontier caching, frontier
  sorting, lamport ceiling, scope, patch divergence, state hash, and
  digest fields.

If implementation cannot isolate coordinate-backed side resolution
without touching full strand overlay comparison, stop and mark GREEN
blocked. Do not drag the strand basement into this slice.

## GREEN Blocker

GREEN was attempted and stopped before commit because the required
validation exposed a scope contradiction.

The original live/coordinate conformance fence can be satisfied with a
narrow reader/finalizer seam, but the required controller suite still
exercises strand-base selector paths in the same file:

```sh
npx vitest run test/unit/domain/services/controllers/ComparisonController.test.ts
```

Observed after the live/coordinate seam attempt:

- `61` tests discovered
- `55` passed
- `6` failed
- all remaining failures were strand-base paths calling
  `_materializeCoordinateGraph`

The remaining failures could be made green only by one of the following:

- adding `_materializeCoordinateGraph` to the existing test fixture,
  which this cycle explicitly forbids because it blesses the host-bag
  seam;
- changing strand-base selector resolution to use a new seam, which the
  original scope explicitly excluded;
- narrowing validation to only live/coordinate behavior, which would
  weaken the requested GREEN validation.

Therefore the original 0106 scope was wrong. It described selector class
names instead of the architectural seam. The corrected scope is
coordinate-backed comparison side resolution:

- `LiveComparisonSelector`
- `CoordinateComparisonSelector`
- `StrandBaseComparisonSelector`

This rejects validation shaving. The cycle should not make
`ComparisonController.test.ts` pass by excluding strand-base assertions or
by adding `_materializeCoordinateGraph` to the fixture.

Full `StrandComparisonSelector` overlay materialization remains out of
scope and should receive its own seam later.

No production code from the blocked attempt was kept.

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
- No full strand overlay seam work.
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
3. Strand-base comparison side resolution needs strand base coordinate
   metadata, coordinate state for that base frontier and ceiling, patch
   entries for that base frontier, and side finalization. It does not
   need full strand overlay materialization.
4. Legitimate dependencies are live frontier read, strand-base coordinate
   metadata read, coordinate state read,
   patch-entry read, state hash, checksum, and scope projection.
5. RuntimeHost leakage includes `_materializeCoordinateGraph`,
   `_loadPatchChainFromSha`, `_crypto`, `_codec`, `_stateHashService`,
   `_blobStorage`, `_persistence`, and strand coordination machinery
   riding together on `ComparisonHost`.
6. Coordinate-backed extraction appears possible without touching full
   strand overlay comparison if RED excludes `StrandComparisonSelector`
   and GREEN routes only live, coordinate, and strand-base selectors
   through the new seam.
7. `ResolvedComparisonSide` should likely become its own runtime
   object/file if imported across the extracted seam.
8. Frontier projection should remain local for the first slice unless
   RED/GREEN would otherwise duplicate its shape. It is a likely follow-up
   owner, not a helper landfill.
9. RED should prove coordinate-backed selectors depend on a host-shaped
   seam and private-ish materialization method today.
10. GREEN should introduce a narrow comparison coordinate read seam and
   update tests to model that seam without touching public APIs.

## Validation

PULL inspection commands run:

```sh
npx vitest run test/unit/domain/services/controllers/ComparisonController.test.ts
```

Result: failed as evidence above. This PULL does not repair it.

Required doc validation before committing this PULL:

```sh
npx vitest run test/conformance/comparisonLiveCoordinateSeam.test.ts
npx eslint test/conformance/comparisonLiveCoordinateSeam.test.ts
npx markdownlint docs/design/0106-comparison-selector-live-coordinate-seam.md
git diff --check
```

The conformance test is expected to fail while the cycle is RED. ESLint,
markdownlint, and diff hygiene are expected to pass.

RED correction validation:

- `npx vitest run test/conformance/comparisonLiveCoordinateSeam.test.ts`
  failed as expected with `8` tests discovered, `4` passed, and `4`
  failed.
- `npx eslint test/conformance/comparisonLiveCoordinateSeam.test.ts`
  passed.
- `npx markdownlint
  docs/design/0106-comparison-selector-live-coordinate-seam.md` passed.
- `git diff --check` passed.

## SLUDGE STRIKER SUMMARY

### 1. Sludge Encountered

- Pattern: broad comparison host bag.
  Files: `src/domain/services/controllers/ComparisonSelector.ts`.
  Why it is sludge: coordinate-backed selector resolution receives
  materialization, patch loading, crypto, codec, persistence, blob
  storage, state-hash service, and strand coordination through one
  host-shaped dependency.
  Status: RED-scoped, not fixed.
- Pattern: private runtime seam leakage.
  Files: `src/domain/services/controllers/ComparisonSelector.ts`,
  `src/domain/RuntimeHost.ts`.
  Why it is sludge: `_materializeCoordinateGraph` and
  `_loadPatchChainFromSha` are internal machinery exposed as selector
  dependencies.
  Status: RED-scoped, not fixed.
- Pattern: test fixture seam drift.
  Files: `test/unit/domain/services/controllers/ComparisonController.test.ts`.
  Why it is sludge: the test fixture exposes `materializeCoordinate`
  while current source calls `_materializeCoordinateGraph`, so the suite
  is red for seam-name drift rather than a deliberate architecture RED.
  Status: surfaced, not fixed.
- Pattern: deliberate RED fence.
  Files: `test/conformance/comparisonLiveCoordinateSeam.test.ts`.
  Why it is sludge prevention: the new RED prevents GREEN from blessing
  the current broad host bag or private runtime seam as the comparison
  selector dependency.
  Status: corrected, intentionally failing.
- Pattern: class-name-driven scope.
  Files: `docs/design/0106-comparison-selector-live-coordinate-seam.md`,
  `test/conformance/comparisonLiveCoordinateSeam.test.ts`.
  Why it is sludge: the original scope said live/coordinate by class
  name, but the validation leak showed strand-base is part of the same
  coordinate-backed side-resolution seam.
  Status: fixed in RED scope.
- Pattern: full strand overlay scope trap.
  Files: `src/domain/services/controllers/ComparisonSelector.ts`.
  Why it is sludge: full strand comparison pulls in
  `createStrandCoordinator`, `callInternalRuntimeMethod`, and
  `materializeStrand`, which would explode the first seam.
  Status: rejected from this cycle.

### 2. Sludge Fixed

- Replaced the old `live/coordinate` RED scope with
  `coordinate-backed comparison side resolution`.
- Added `StrandBaseComparisonSelector` to the deliberate RED fence.
- Kept `StrandComparisonSelector` full overlay materialization out of
  scope.
- Kept production code untouched.

### 3. Sludge Rejected

- Rejected whole-file demolition.
- Rejected mechanical class splitting.
- Rejected `RuntimeHost` rewrite.
- Rejected full strand overlay comparison in the first seam.
- Rejected facade, manager, helper, utility, and `*Like` names.
- Rejected making stale tests green by adding more host-bag fields.
- Rejected validation shaving by excluding strand-base assertions.

### 4. Sludge Deferred / Tracked

- Full strand overlay comparison seam remains future work.
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
- `npx vitest run test/conformance/comparisonLiveCoordinateSeam.test.ts`
  failed as expected with `8` tests discovered, `4` passed, and `4`
  failed.
- `npx eslint test/conformance/comparisonLiveCoordinateSeam.test.ts`
  passed.
- `npx markdownlint
  docs/design/0106-comparison-selector-live-coordinate-seam.md` passed.
- `git diff --check` passed.

### 6. Remaining Risk

Remaining risk: `ComparisonSelector.ts` is tempting to overcut. The next
GREEN must remove the coordinate-backed side seam without creating
`ComparisonHost` under a new name. If full strand overlay comparison,
transfer planning, or RuntimeHost cleanup enters the slice, the cycle is
no longer narrow.
