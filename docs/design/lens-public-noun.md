# Lens As A First-Class Public Noun

Status: IMPLEMENTING

Legend: Observer Geometry

Cycle: OG-010

## Problem

`Observer` is now the public read-handle noun, but the projection or aperture
that shapes an observer is still exposed only as `ObserverConfig`.

That is technically workable, but optically weak:

- it reads like internal plumbing rather than a concept
- it does not reinforce the projection/aperture model
- it leaves the public vocabulary flatter than the architecture actually is

The public stack is cleaner if the projection itself has a first-class noun.

## Decision

Expose `Lens` as the primary public noun for observer aperture definitions.

For v15:

- `Lens` becomes the preferred public type name
- `ObserverConfig` remains exported as a compatibility alias
- `observer(...)` and translation-cost APIs should speak in terms of `Lens`
- README and Guide should teach `Observer` plus `Lens`, not just
  `Observer` plus an unnamed config object

## Why `Lens`

`Lens` is the best available noun for this specific layer because it captures:

- visibility aperture
- projection
- selective exposure/redaction
- compatibility with the broader observer-geometry and optics framing

It is also lighter-weight and more legible than `ObserverConfig`, especially
for both human readers and coding agents scanning the public type surface.

## Non-goals

- do not add runtime ceremony just to manufacture a `Lens` object
- do not remove `ObserverConfig` outright in this slice
- do not attempt the much larger `WorkingSet` -> `Strand` rename here

## Intended Outcome

After this slice:

- a new consumer can discover `Lens` directly from the public surface
- `Observer` reads as a projection over a `Worldline` through a `Lens`
- the v15 noun set becomes more coherent without destabilizing runtime behavior
