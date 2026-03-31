# Retrospective: Aperture Public Noun

Date: 2026-03-28

Legend: Observer Geometry

Cycle: OG-010

## Governing Design Inputs

- OG-010-public-api-design-thinking (deleted)
- public-api-design-thinking (deleted)
- public-api-stratification (deleted)
- aperture-public-noun (deleted)

## What Landed

- `Aperture` is now a first-class public type noun.
- `ObserverConfig` remains exported as a compatibility alias.
- Public signatures now speak in terms of `Aperture` for observer creation and
  translation-cost APIs.
- README and Guide now teach `Observer` as a projection over a `Worldline`
  through an aperture.
- The noun is pinned by a script-level public API test and the consumer
  typecheck fixture.

## Design Alignment Audit

- first-class aperture noun: aligned
- compatibility for existing `ObserverConfig` imports: aligned
- docs and type surface teaching the same noun set: aligned
- low runtime blast radius: aligned

## Drift

- Runtime code still does not expose a concrete `Aperture` class or factory, only a
  type-level noun. That is intentional for now.

## Why The Drift Happened

- The goal of this slice was vocabulary and surface clarity, not new runtime
  ceremony.

## Resolution

- Accept the type/documentation-level noun cut for v15.
- Revisit only if real consumers prove they need runtime helpers for aperture
  construction or reuse.
