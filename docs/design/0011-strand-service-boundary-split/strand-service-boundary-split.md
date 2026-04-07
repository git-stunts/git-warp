# Cycle 0011 — StrandService Boundary Split

**Status:** IMPLEMENTED

**Date:** 2026-04-06

## Sponsors

- **Human:** James Ross
- **Agent:** Codex

## Hill

Break `StrandService` into smaller runtime-honest collaborators while
preserving current strand behavior under the coverage locked in by cycle
0010.

## Playback questions

### Agent questions

1. Does the existing `StrandService` test suite still pass without
   semantic drift after the split?
2. Are the four main responsibility seams explicit and separate?
   (`StrandDescriptorStore`, `StrandMaterializer`,
   `StrandPatchService`, `StrandIntentService`)
3. Did the cycle reduce shape-trusted normalization sludge at the
   descriptor boundary instead of just moving helpers into more files?
4. Is `StrandService` now a thin facade/orchestrator instead of a
   multi-domain god object?

### Human questions

1. Is `StrandService` materially easier to reason about after the
   split?
2. Does the decomposition follow Systems-Style JavaScript instead of
   creating fake class hierarchy theater?
3. Does the cycle improve the runway for the later
   `ConflictAnalyzerService` breakup without dragging that work into
   scope now?

## Baseline

Cycle 0010 ended with `StrandService.js` heavily covered and suitable
for refactoring behind executable spec:

- approx. `2060` LOC
- `98.56%` line coverage at cycle close

Current responsibility pile inside `StrandService`:

- strand CRUD and ref layout
- descriptor parsing / normalization
- overlay metadata hydration
- braid ref synchronization
- patch-builder construction and patch commit flow
- queued intent construction, admission, and tick draining
- patch collection and materialization

The key Systems-Style problem is not just size. The file contains too
many shape-trusted records and too much boundary parsing mixed into
business logic and orchestration.

## Seam map

The current test surface already pins most of the future split, but the
ownership lines need to stay explicit during extraction:

- `StrandDescriptorStore`
  - public witnesses: `create`, `get`, `list`, `drop`, `braid`
  - helper witnesses: `_readDescriptorByOid`, `_writeDescriptor`,
    `_readOverlayMetadata`, `_hydrateOverlayMetadata`,
    `_loadBraidedReadOverlays`, ref builders, `_syncBraidRefs`
- `StrandMaterializer`
  - public witnesses: `materialize`, `getPatchEntries`, `patchesFor`
  - helper witnesses: `_collectBasePatches`, `_collectOverlayPatches`,
    `_collectBraidedOverlayPatches`, `_collectPatchEntries`,
    `_materializeDescriptor`
- `StrandPatchService`
  - public witnesses: `createPatchBuilder`, `patch`
  - helper witnesses: `_commitQueuedPatch`, `_syncOverlayDescriptor`
- `StrandIntentService`
  - public witnesses: `queueIntent`, `listIntents`, `tick`
  - helper witnesses: `_classifyQueuedIntents`,
    `_commitAdmittedQueuedIntents`, `_persistTickResult`

Cycle 0011 should treat this map as the extraction guardrail. If a move
does not make one of these ownership lines clearer, it is probably just
shuffling helpers around.

## Strategy

### Phase 1 — Lock the boundary

- Re-read the current tests and the highest-risk call paths.
- Identify the descriptor and queue normalization helpers that currently
  act as soft schemas.
- Add focused regression tests only if the existing suite misses a seam
  needed for safe extraction.

### Phase 2 — Extract the descriptor boundary

- Pull descriptor read/write, ref layout, overlay metadata hydration,
  and braid ref sync behind a `StrandDescriptorStore`.
- Replace anonymous normalized descriptor bags with a more explicit
  boundary representation.

### Phase 3 — Extract materialization

- Move patch collection and descriptor materialization into
  `StrandMaterializer`.
- Keep Lamport ceiling and braid-visible patch-set behavior pinned by
  existing tests.

### Phase 4 — Extract patch and intent flow

- Move patch-builder / commit flow into `StrandPatchService`.
- Move queued intent classification, drain, and persistence into
  `StrandIntentService`.
- Reduce `StrandService` to a façade that composes those collaborators.

## Non-goals

- No `ConflictAnalyzerService` decomposition in this cycle.
- No visualization-surface removal work in this cycle.
- No public API rename for strand nouns in this cycle.
- No semantic change to braid, overlay, intent-admission, or
  materialization behavior except where a bug is proven by tests.
- No coverage chase as the primary goal; coverage already exists as the
  safety harness.

## Accessibility / assistive reading posture

Not applicable — internal structural refactor.

## Localization / directionality posture

Not applicable — no user-facing copy is intended to change.

## Agent inspectability / explainability posture

The split should improve inspectability for both humans and agents:

- each extracted collaborator should own one responsibility family
- boundary parsing should live near the owning module instead of being
  smeared across one giant helper corridor
- `StrandService` should become easier to explain from file structure
  alone

The preferred proof is greppable module ownership plus unchanged
behavior under the existing tests.

## Hard gates

- `npm run test:coverage` still passes
- global coverage does not regress from the cycle 0010 close
- noCoordination suite remains green
- no fake runtime modeling: avoid typedef cosplay and tag-switching
  disguised as decomposition

## Result (2026-04-06)

### What shipped

- extracted `StrandDescriptorStore`
- extracted `StrandMaterializer`
- extracted `StrandPatchService`
- extracted `StrandIntentService`
- extracted shared helper support into `strandShared.js`
- centralized the strand typedef corridor into `strandTypes.js`
- removed dead seam-wrapper methods from `StrandService` and pointed
  seam tests at the real collaborators
- restored merge-readiness by making `npm run lint`,
  `npm run typecheck:src`, and `npm run test:coverage` all green on the
  branch

### End state

`StrandService` is now materially thinner and acts as a façade over the
four explicit collaborator seams named in the hill.

Approximate source size movement during the cycle:

| File | Final LOC |
|------|-----------|
| `StrandService.js` | `1186` |
| `StrandDescriptorStore.js` | `643` |
| `StrandPatchService.js` | `484` |
| `StrandIntentService.js` | `456` |
| `StrandMaterializer.js` | `215` |
| `strandShared.js` | `128` |
| `strandTypes.js` | `88` |

The remaining residue is now explicit and smaller in scope:

- `StrandService` still carries some domain-level helper logic for
  strand creation, braid option normalization, and public façade shape
- the strand model is still typedef-backed rather than constructor-backed
  runtime nouns
- those remaining model concerns are backlogged explicitly instead of
  being hidden inside one god object

## Related

- `docs/method/backlog/bad-code/PROTO_strand-service-god-object.md`
- `docs/method/backlog/bad-code/PROTO_strand-service-dead-branches.md`
- `docs/method/backlog/asap/PROTO_conflict-analyzer-pipeline-decomposition.md`
- `docs/SYSTEMS_STYLE_JAVASCRIPT.md`
