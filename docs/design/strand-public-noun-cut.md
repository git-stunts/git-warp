# Public `Strand` Noun Cut

Status: IMPLEMENTED

Legend: Observer Geometry

Cycle: OG-010

## Why This Note Exists

`git-warp` has already made several public noun cuts during the `v15` cycle:

- `WarpGraph` -> `WarpApp` / `WarpCore`
- `ObserverView` -> `Observer`
- `ObserverConfig` -> `Lens`

The remaining public noun mismatch is `WorkingSet`.

That noun is technically serviceable, but it undersells the actual product
claim. These are not just scratch buffers or memoized overlays. They are
speculative causal lanes with pinned base observations, deterministic ticking,
and braid composition.

`Strand` is the better public noun.

## Decision

For `v15`, the public API should use `Strand` instead of `WorkingSet`.

This cut applies to:

- JavaScript and TypeScript public method names
- public interfaces and exported type names
- public selector/source vocabulary
- public comparison and conflict payloads
- CLI command nouns and flags
- README / GUIDE / docs teaching order

This cut does **not** require a full internal implementation rename in the same
slice.

Internal mechanics may continue to use:

- `WorkingSetService`
- `working_set`-shaped ref layout
- `working-set`-named internal helper files

as long as those remain implementation details and do not leak through the
public `v15` surface.

## Public Mapping

### Methods

- `createWorkingSet` -> `createStrand`
- `getWorkingSet` -> `getStrand`
- `listWorkingSets` -> `listStrands`
- `braidWorkingSet` -> `braidStrand`
- `dropWorkingSet` -> `dropStrand`
- `materializeWorkingSet` -> `materializeStrand`
- `getWorkingSetPatches` -> `getStrandPatches`
- `patchesForWorkingSet` -> `patchesForStrand`
- `createWorkingSetPatch` -> `createStrandPatch`
- `patchWorkingSet` -> `patchStrand`
- `queueWorkingSetIntent` -> `queueStrandIntent`
- `listWorkingSetIntents` -> `listStrandIntents`
- `tickWorkingSet` -> `tickStrand`
- `compareWorkingSet` -> `compareStrand`
- `planWorkingSetTransfer` -> `planStrandTransfer`

### Types

- `WorkingSetError` -> `StrandError`
- `WorkingSetObserverSource` -> `StrandObserverSource`
- `WorkingSetCreateOptions` -> `StrandCreateOptions`
- `WorkingSetBraidOptions` -> `StrandBraidOptions`
- `WorkingSetReadOverlayDescriptor` -> `StrandReadOverlayDescriptor`
- `WorkingSetIntentDescriptor` -> `StrandIntentDescriptor`
- `WorkingSetTickCounterfactual` -> `StrandTickCounterfactual`
- `WorkingSetTickRecord` -> `StrandTickRecord`
- `WorkingSetDescriptor` -> `StrandDescriptor`

### Selector Vocabulary

- `{ kind: 'working_set', workingSetId }` -> `{ kind: 'strand', strandId }`
- `{ kind: 'working_set_base', workingSetId }` -> `{ kind: 'strand_base', strandId }`
- `coordinateKind: 'working_set'` -> `coordinateKind: 'strand'`
- `coordinateKind: 'working_set_base'` -> `coordinateKind: 'strand_base'`

### Payload Fields

- `workingSet` -> `strand`
- `workingSetId` -> `strandId`
- `braidedWorkingSetIds` -> `braidedStrandIds`

## CLI Implications

The CLI is part of the public API and should follow the same noun cut.

Public command family:

- `git warp strand ...`

Public debugger selector flag:

- `--strand <id>`

The legacy `working-set` noun should not remain in the normal CLI help, README,
or guide once this slice lands.

## Design Constraints

### 1. This is a true major-version cut

We should not keep `WorkingSet` as a public compatibility alias in the typed or
documented `v15` surface.

If runtime shims exist temporarily, they should fail loudly and point callers
to `Strand`, not continue to work silently.

### 2. Product and core must both agree

`Strand` is not just an app-facing sugar word.

It must be consistent across:

- `WarpApp`
- `WarpCore`
- worldline/observer selector vocabulary
- comparison / transfer APIs
- conflict analysis / debugger output

### 3. Internal storage is allowed to lag

We do not need to rename:

- ref paths
- blob schema keys
- service filenames
- internal helper variable names

unless those internals are exposed publicly.

That keeps the slice bounded without making the public API dishonest.

## Tests As Spec

The executable spec for this cut should prove:

1. `index.js` exports `StrandError`, not `WorkingSetError`
2. `index.d.ts` exposes `Strand*` methods and types, not `WorkingSet*`
3. `Worldline`, `Observer`, comparison, and transfer selector types use
   `strand` / `strand_base`
4. README and guide teach `Strand`
5. CLI help and commands expose `strand`, not `working-set`
6. `WarpApp` remains free of direct materialization/inspection methods even
   after the noun cut

## Non-Goals

- full internal service/file rename
- changing braid semantics
- changing strand storage layout
- changing ticking semantics
- introducing `PlaybackHead`

## Open Questions

1. Should the dedicated strand docs live at `docs/STRANDS.md` or stay at the
   historical `docs/WORKING_SETS.md` path with renamed content?

Current bias: create `docs/STRANDS.md` and update the front-door docs to use
that path.
