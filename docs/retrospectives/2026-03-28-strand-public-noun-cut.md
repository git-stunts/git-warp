# Retrospective: Strand Public Noun Cut

Date: 2026-03-28

Legend: Observer Geometry

Cycle: OG-010

## Governing Design Inputs

- [OG-010-public-api-design-thinking](../../BACKLOG/OG-010-public-api-design-thinking.md)
- [public-api-design-thinking](../design/public-api-design-thinking.md)
- [public-api-stratification](../design/public-api-stratification.md)
- [strand-public-noun-cut](../design/strand-public-noun-cut.md)

## What Landed

- `Strand` is now the public speculative-lane noun across the package surface.
- `WarpCore` exposes `createStrand()`, `getStrand()`, `listStrands()`, `braidStrand()`, `dropStrand()`, `materializeStrand()`, `getStrandPatches()`, `patchesForStrand()`, `createStrandPatch()`, `patchStrand()`, `queueStrandIntent()`, `listStrandIntents()`, `tickStrand()`, `compareStrand()`, and `planStrandTransfer()`.
- `WarpApp` mirrors the product-facing strand flows without exposing core replay or inspection methods.
- Public selector/source vocabulary now speaks in terms of `strand` / `strand_base` and `strandId`.
- CLI help and command routing now expose `git warp strand ...` instead of `git warp strand ...`.
- README, Guide, Strands docs, changelog, and public API tests now teach the `Strand` noun.

## Design Alignment Audit

- `aligned` — public JS/TS methods use `Strand` instead of `Strand`
- `aligned` — public selector vocabulary uses `strand` / `strand_base`
- `aligned` — CLI family and flags use `strand`
- `aligned` — `WarpApp` remains free of direct materialization and whole-state inspection methods
- `aligned` — internal storage and service names are still allowed to lag behind the public noun cut

## Drift

- `ARCHITECTURE.md` still contains older `strand` language in several sections.
- Internal implementation files and service names such as `StrandService.js` remain unchanged.

## Why The Drift Happened

- The goal of this slice was the public noun cut, not the full documentation corpus audit or a deep internal service/file rename.

## Resolution

- Accept the public `Strand` cut as landed for `v15`.
- Keep the internal `Strand*` implementation names as private mechanics for now.
- Reconcile the remaining historical and architecture docs under `OG-012` before release.
