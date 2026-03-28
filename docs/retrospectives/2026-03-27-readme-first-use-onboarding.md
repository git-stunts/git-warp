# Retrospective: README First-Use Onboarding

**Date:** 2026-03-27
**Legend:** Observer Geometry
**Cycle:** `OG-010`
**Design:** `docs/design/readme-first-use-onboarding.md`, `docs/design/public-api-design-thinking.md`

## What Landed

- Removed the long inline `What's New` release feed from [README.md](../../README.md) and left release chronology to `CHANGELOG.md`.
- Reframed the opening README content around first-use onboarding rather than
  release notes.
- Added early `Concepts` and `Glossary` sections so a first-time reader does
  not need to infer WARP terms from code examples alone.
- Replaced `Core Primitives` with `Main Components` and softened the tone so
  the README teaches the system as-designed instead of sounding corrective.
- Updated the Quick Start to use a human-readable observer label and explain
  what that first `observer(...)` argument means.
- Expanded the `Read Model` section so it explains why worldline-plus-observer
  is the normal application-facing boundary, not only that it is preferred.
- Tightened the executable README contract in
  `test/unit/scripts/public-api-readme-shape.test.js` to cover the new
  onboarding structure.

## Design Alignment Audit

- `aligned` — the README no longer acts as a release-news feed.
- `aligned` — the README now introduces WARP concepts and terminology before
  deeper API sections.
- `aligned` — glossary-level nouns now appear early enough for first-time
  readers and agents.
- `aligned` — the Quick Start still demonstrates the worldline-first observer
  read path.
- `aligned` — the Quick Start now explains the observer label argument instead
  of leaving it as unexplained ceremony.
- `aligned` — the `Read Model` section now explains the boundary tradeoff, not
  just the preferred order of calls.
- `aligned` — the public README contract is guarded by executable tests rather
  than prose review only.

## Drift

There was no semantic drift from the governing design note.

One deliberate scope boundary remains:

- this slice reworked the README front half only
- it did not attempt a full pass over every secondary doc that still carries
  older onboarding tone or terminology

## Why The Adjustment Happened

- deliberate tradeoff: the README is the highest-leverage first-contact surface,
  so the onboarding cleanup was scoped there first

## Resolution

- accepted as the correct slice boundary
- broader documentation tone cleanup remains follow-on work inside `OG-010`

## Verification

- `npx vitest run test/unit/scripts/public-api-readme-shape.test.js test/unit/scripts/read-api-doc-consistency.test.js`
- `node scripts/lint-markdown-code-samples.js README.md`
