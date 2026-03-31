# Retrospective: Worldline Direct Read Surface

## Governing Design Docs

- public-api-design-thinking.md (deleted)
- public-api-stratification.md (deleted)
- worldline-direct-read-surface.md (deleted)
- worldline-observer-api-phasing.md (deleted)

## What Landed

- `Worldline` now exposes direct stable-read helpers for the full aperture of
  its pinned source.
- Consumers can now read, query, and traverse through `Worldline` directly
  without creating a no-op `Observer` first.
- The README Quick Start now teaches `Worldline` directly for stable read,
  query, and traversal, while keeping `Observer` as the filtered-read concept.
- A worldline unit spec and script-level doc tests now pin that behavior.

## Design Alignment Audit

- `aligned` — the stable read path is now less awkward than runtime-wide
  inspection for the no-filter case.
- `aligned` — `Observer` remains the filtered aperture noun rather than the
  mandatory first step for every read.
- `aligned` — the README now introduces `Observer` later, when a filtered view
  is actually needed.
- `partially aligned` — broad enumeration still exists on `Worldline`, so cost
  signaling remains important even on the pinned full-aperture path.

## Drift

- `Worldline` now carries more direct read surface than the original minimal
  Phase B cut.
- The slice stopped short of adding content helpers or a grouped inspection
  namespace.

## Why The Drift Happened

- The IBM cycle demonstrated that the earlier minimal `Worldline` noun still
  left the honest path too awkward for first-use onboarding.
- Direct read helpers were the smallest API cut that improved the ergonomics
  without inventing a new noun.

## Resolution

- Accept this as a deliberate refinement of the public read model.
- Continue OG-010 to decide whether further API shaping is needed, especially
  around inspection grouping and the unresolved `Strand` / `Aperture` naming
  questions.
