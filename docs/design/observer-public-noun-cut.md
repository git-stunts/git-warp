# Observer Public Noun Cut

Status: IMPLEMENTED

Legend: Observer Geometry

Cycle: OG-010

## Problem

The public read-side API still exposes the noun `ObserverView`.

That name is weaker than the concept it represents:

- it sounds like a presentation wrapper rather than a first-class read handle
- it duplicates meaning already carried by `Observer`
- it makes both human users and coding agents more likely to treat the object
  as a thin view helper rather than a pinned observer over a worldline source

The README and public API stratification work already point toward the intended
mental model:

- `WarpRuntime` is the host/runtime and write surface
- `Worldline` is the pinned read-history primitive
- `Observer` is the filtered product-read primitive

The public type and export surface should match that model directly.

## Decision

Make a breaking public-noun cut:

- `ObserverView` is removed from the public API surface
- the public class and return type become `Observer`
- `worldline.observer(...)` and `graph.observer(...)` return `Promise<Observer>`
- public docs and consumer examples use `Observer`

This slice does **not** introduce a compatibility alias. The point is to teach
the correct noun, not to support both indefinitely.

## Sponsor Playback

### Sponsor Human

An app developer should be able to infer:

- `Observer` is the read handle
- it is pinned, filtered, and read-only
- it is not just a UI or presentation wrapper

### Sponsor Agent

A coding agent should be able to infer:

- `Observer` is the public noun to reach for after `Worldline`
- query and traversal methods scoped to the observer are the intended
  application-facing read path
- `ObserverView` is not a second competing read abstraction

## Scope

This slice includes:

- public runtime exports
- public type declarations
- public return signatures
- consumer type surface
- public docs that describe the current read model

This slice does not attempt to:

- rewrite every historical RFC or retrospective in the repository
- introduce `Aperture` as a public noun in the same change
- rename `Strand` or `WarpRuntime`

## Tests As Spec

The executable spec for this slice should prove:

1. `index.js` exports `Observer`
2. `index.js` does not export `ObserverView`
3. `index.d.ts` declares `Observer`
4. `index.d.ts` does not declare `ObserverView`
5. `worldline.observer(...)` and `graph.observer(...)` return `Observer`
6. the consumer typecheck fixture compiles against `Observer`

## Design Alignment Note

This cut is intentionally stricter than the earlier open question in
`public-api-stratification.md`.

That note asked whether `ObserverView` should gain an alias such as
`Observer`, or whether docs alone were enough.

The answer from this slice is:

- docs alone are not enough
- the public noun should be cut cleanly to `Observer`
