# Public API Cost Signaling

Status: DRAFT

Legend: Observer Geometry

Cycle: OG-010

## Problem

The README now teaches the worldline-first read model more honestly, but the
public type surface still needs to communicate cost and intended usage without
accidentally teaching that broad read APIs are somehow forbidden.

That means a consumer reading `index.d.ts` can still infer the wrong default
path:

1. open `WarpRuntime`
2. materialize or enumerate visible state
3. loop over arrays
4. rebuild a product read model in app space

That is exactly the failure pattern this IBM cycle exists to stop.

## Sponsor Playback

### Sponsor Human

A developer browsing the public API in an editor or generated docs should learn:

- `Worldline` and `Observer` are the preferred read-side primitives
- runtime-wide enumeration is still valid
- direct materialization is substrate machinery, not the first product-read move
- the real anti-pattern is rebuilding a second graph layer or traversal engine
  in app space

### Sponsor Agent

A coding agent reading `index.d.ts` should infer:

- prefer `worldline().observer(...).query()` or `traverse`
- `getNodes()`, `getEdges()`, `neighbors()`, and direct runtime `query()` are
  legitimate APIs when you intentionally want whole-visible-state scope
- avoid `materialize*()` as the default application read strategy
- avoid rebuilding graph reads and traversal logic above the substrate

## Design Goal

The type surface should communicate two things explicitly:

1. which APIs are primary product-read surfaces
2. which APIs are advanced substrate mechanics or whole-visible-state surfaces

The point is not to deprecate broad APIs.
The point is to make their scope and cost model impossible to miss, while
keeping the real warning aimed at app-local graph reconstruction.

## Intended Changes

- annotate runtime-wide enumeration methods as legitimate broad-read surfaces
- annotate direct runtime `query()` as valid but not the preferred product-read
  entrypoint
- annotate `materialize*()` as advanced substrate replay primitives
- annotate `Worldline.materialize()` similarly so the read-handle hierarchy
  stays honest
- pin the wording with an executable doc test

## Non-goals

- no runtime warnings in this slice
- no renaming of `Strand`
- no introduction of `Aperture` as a public noun here
- no application-specific query helpers

## Acceptance Criteria

1. `index.d.ts` explicitly labels runtime-wide enumeration methods as valid
   broad-read surfaces.
2. `index.d.ts` explicitly tells consumers to prefer `Worldline` / `Observer`
   for stable product reads.
3. `index.d.ts` explicitly labels `materialize*()` as advanced substrate replay
   mechanics.
4. `index.d.ts` explicitly warns against rebuilding a second graph/traversal
   layer in app space.
5. A script-level test fails if those cost signals disappear.
