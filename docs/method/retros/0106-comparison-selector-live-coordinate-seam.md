# 0106 Comparison Coordinate-Backed Side Seam Retrospective

- Outcome: `hill met for coordinate-backed comparison side seam`
- Cycle doc:
  [docs/design/0106-comparison-selector-live-coordinate-seam.md](../../design/0106-comparison-selector-live-coordinate-seam.md)
- Release lane: `v17.0.0`

## Outcome

0106 is hill met for the focused coordinate-backed comparison side seam.

The cycle removed the broad `ComparisonHost` dependency from
`LiveComparisonSelector`, `CoordinateComparisonSelector`, and
`StrandBaseComparisonSelector`. Those selectors now resolve through
explicit comparison-owned reader and finalizer seams rather than reaching
directly into `_materializeCoordinateGraph`, `_loadPatchChainFromSha`,
`_blobStorage`, or `_persistence`.

This does not mean comparison is clean. Full strand overlay comparison,
transfer planning, helper ownership inside `ComparisonSelector.ts`, and
broader `RuntimeHost` coupling remain separate work.

## What Went Well

- The RED separated accidental fixture drift from the architecture fence.
- The scope was corrected from class-name-driven `live/coordinate` wording
  to coordinate-backed comparison side resolution.
- `StrandBaseComparisonSelector` was included because it resolves a base
  coordinate side, not a full strand overlay.
- Full `StrandComparisonSelector` overlay materialization stayed out of
  scope.
- `ComparisonController.test.ts` was made green by modeling the narrow
  seam, not by adding `_materializeCoordinateGraph` to the fixture.
- The no-op assertion in the host-backed reader was rejected.
- Runtime constructor validation was added so invalid host-backed adapter
  construction fails in the constructor instead of relying only on
  TypeScript.
- Reader and finalizer ports were split into separate files.

## What Went Wrong

- The original scope said `live/coordinate` by selector name and missed
  that strand-base resolution belongs to the same coordinate-backed seam.
- The first GREEN attempt stopped because controller validation exposed
  that scope mismatch.
- The first adapter correction improved the compile-time dependency type
  but still did not satisfy the runtime RAII constructor standard.
- `ComparisonSelector.ts` remains dense and still exports or owns helper
  concepts used by the new adapters.
- The process nearly turned cleanup into the product. The next move must
  be a v17 reality check, not another automatic seam.

## What Changed From Original Plan

- The seam name changed from live/coordinate selector resolution to
  coordinate-backed comparison side resolution.
- `StrandBaseComparisonSelector` moved into scope.
- `StrandComparisonSelector` stayed out of scope.
- The implementation split reading from finalization because they are
  separate reasons to change.
- Constructor compatibility was rejected in favor of explicit DI and
  runtime validation.

## Follow-Up Handling

No new backlog cards were created in this retrospective.

Known follow-up:

- Full strand overlay comparison still uses the old strand machinery.
- Transfer planning still carries content-loading host dependencies.
- `ComparisonSelector.ts` helper ownership remains unresolved:
  frontier normalization, coordinate request building, strand metadata
  building, patch frontier collection, and finalization/checksum helpers.
- Broader `RuntimeHost` gravity remains mapped by the 0104 survey.
- v17 release readiness is not established by this cycle.

## Recommendation For Next Cycle

Recommendation: stop pulling deslugging seams by default.

The next cycle should be a doc-only v17 reality check that separates true
release blockers from known post-v17 debt. Cleanup still matters, but it
must attach to a failing test, blocked feature, public API lie, runtime
correctness risk, or repeated pain point. Crisp TypeScript is a tool.
Trustworthy v17 is the target.

## SLUDGE STRIKER SUMMARY

### 1. Sludge Encountered

- Pattern: class-name-driven scope.
  Files: `docs/design/0106-comparison-selector-live-coordinate-seam.md`,
  `test/conformance/comparisonLiveCoordinateSeam.test.ts`.
  Why it was sludge: the first scope excluded strand-base even though
  strand-base is coordinate-backed side resolution.
  Status: fixed.
- Pattern: compile-time RAII cosplay.
  Files:
  `src/domain/services/controllers/HostBackedComparisonCoordinateSideReader.ts`.
  Why it was sludge: a stricter TypeScript dependency type alone did not
  prove invalid runtime construction fails.
  Status: fixed by constructor validation.
- Pattern: helper landfill gravity.
  Files: `src/domain/services/controllers/ComparisonSelector.ts`.
  Why it remains sludge: helper concepts still live beside selector
  runtime classes.
  Status: deferred and named.

### 2. Sludge Fixed

- Replaced coordinate-backed selector dependence on `ComparisonHost` with
  explicit reader/finalizer seams.
- Replaced direct selector access to `_materializeCoordinateGraph` and
  `_loadPatchChainFromSha` with `ComparisonCoordinateSideReadPort`.
- Replaced the mixed reader/finalizer port file with separate port files.
- Replaced compile-time-only host-backed adapter validity with runtime
  constructor validation.
- Replaced stale controller fixture shape with a narrow fake reader seam.

### 3. Sludge Rejected

- Rejected validation shaving around strand-base behavior.
- Rejected adding `_materializeCoordinateGraph` to the test fixture.
- Rejected full strand overlay scope creep.
- Rejected RuntimeHost cleanup in this cycle.
- Rejected package-root export changes.
- Rejected facade, manager, helper, utility, and placeholder names.

### 4. Sludge Deferred / Tracked

- Full strand overlay comparison remains future work.
- Transfer planning host dependencies remain future work.
- Helper ownership in `ComparisonSelector.ts` remains future work.
- Broader RuntimeHost cleanup remains future work.
- v17 release readiness remains undecided.

### 5. Anti-Sludge Checks Actually Run

- `npx vitest run test/conformance/comparisonLiveCoordinateSeam.test.ts`
  passed during GREEN.
- `npx vitest run
  test/unit/domain/services/controllers/ComparisonController.test.ts`
  passed during GREEN.
- `npm run typecheck` passed during GREEN.
- `npm run lint:sludge` passed during GREEN.
- ESLint on touched TypeScript files passed during GREEN.
- Markdownlint and `git diff --check` passed during GREEN correction.

### 6. Remaining Risk

Remaining risk: 0106 repaired one coordinate-backed comparison side seam.
It did not clean comparison as a subsystem, RuntimeHost as a gravity well,
or v17 as a release. The next safe move is a release boundary decision,
not another cleanup reflex.
