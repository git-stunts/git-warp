# Retrospective: Public API Cost Signaling

## Governing Design Docs

- public-api-design-thinking.md (deleted)
- public-api-stratification.md (deleted)
- public-api-cost-signaling.md (deleted)
- observer-public-noun-cut.md (deleted)

## What Landed

- `index.d.ts` now labels broad runtime enumeration methods as inspection APIs.
- The runtime `query()` docs now point consumers toward `Worldline` and
  `Observer` for stable product reads.
- `materialize()`, `materializeCoordinate()`, `materializeStrand()`, and
  `Worldline.materialize()` now describe themselves as advanced substrate replay
  primitives instead of neutral everyday reads.
- A script-level test now guards those cost signals.

## Design Alignment Audit

- `aligned` — the public type surface now communicates inspection versus
  product-read boundaries more clearly.
- `aligned` — the preferred `Worldline` / `Observer` read path is now visible in
  the type surface, not only in the README.
- `aligned` — direct `materialize*()` calls are documented as advanced replay
  mechanics.
- `partially aligned` — cost signaling is still documentary; this slice did not
  add runtime counters or warnings.

## Drift

- The surface still exposes the same method names and breadth of capability.
- There is still no grouped `Inspection API` namespace in code; the grouping is
  explanatory rather than structural.

## Why The Drift Happened

- This slice was intentionally bounded to cost-signaling, not surface
  restructuring.
- The IBM cycle still needs to prove whether documentation and type-surface
  signals are enough before adding stronger API grouping.

## Resolution

- Accept this as the next bounded IBM slice.
- Continue OG-010 with public-surface shaping only if consumers still infer the
  wrong path after the stronger docs and type-surface signals.
