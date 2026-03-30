# Retrospective: Guide Read Model Alignment

Date: 2026-03-28

Legend: Observer Geometry

Cycle: OG-010

## Governing Design Inputs

- OG-010-public-api-design-thinking (deleted)
- public-api-design-thinking (deleted)
- public-api-stratification (deleted)
- guide-read-model-alignment (deleted)

## What Landed

- The Guide Quick Start now teaches write -> `Worldline` -> direct read/query/traverse.
- The Guide reading section now introduces product reads before runtime-wide
  inspection and materialization.
- The Guide query/traversal section now leads with `worldline.query()` and
  `worldline.traverse`.
- Observer examples now build from `Worldline` instead of starting with
  runtime-first materialization.
- Guide shape is now pinned by script-level documentation tests.

## Design Alignment Audit

- `Worldline` as the primary stable read noun: aligned
- `Observer` as an aperture on top of `Worldline`: aligned
- broad runtime enumeration and materialization framed as inspection/advanced:
  aligned
- README and Guide teaching the same read doctrine: aligned
- no app-local graph rebuild implied by early docs: aligned

## Drift

- The Guide still contains many valid lower-level runtime examples later in the
  document. They are no longer the first teaching path, but the long-form guide
  is not yet fully stratified section-by-section.

## Why The Drift Happened

- The Guide predates the IBM public API cycle and accumulated capability-first
  examples over time.

## Resolution

- Accept the current slice as sufficient for early teaching-order correction.
- Keep deeper Guide stratification inside OG-010 only if remaining public API
  reviews show that later sections still teach the wrong default behavior.
