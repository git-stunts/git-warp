# Retrospective: README WARP Positioning And Fit

**Date:** 2026-03-27
**Legend:** Observer Geometry
**Cycle:** `OG-010`
**Design:** `docs/design/readme-warp-positioning-and-fit.md`, `docs/design/public-api-design-thinking.md`

## What Landed

- Reworked the top of [README.md](../../README.md) so it no longer implies
  that WARP itself is Git-specific.
- Added an explicit `What Is WARP?` section that states:
  - WARP is not tied to Git
  - `git-warp` implements WARP on top of Git
  - theory readers should go to `AIΩN`
- Added an explicit `Why Git?` section that explains Git as the storage and
  transport substrate rather than the definition of WARP.
- Moved the CRDT convergence story to the front of the README so a new user
  sees early that graph sync does not require hand-resolving Git merge
  conflicts.
- Added a use-case fit table comparing `git-warp`, `Echo`, and conventional
  alternatives.
- Linked the sibling [Echo](https://github.com/flyingrobots/echo) runtime so
  the README now explains where `git-warp` ends and a realtime engine begins.
- Tightened the executable README contract in
  `test/unit/scripts/public-api-readme-shape.test.js` to guard the new
  positioning language and fit matrix.

## Design Alignment Audit

- `aligned` — the README now distinguishes WARP from `git-warp` explicitly.
- `aligned` — the README now explains CRDT sync early enough to head off the
  obvious "do I resolve Git merge conflicts?" concern.
- `aligned` — the README now explains why Git was chosen as the substrate
  instead of leaving that inference to the reader.
- `aligned` — the README now links both `AIΩN` and `Echo`, giving theory and
  sibling-runtime context.
- `aligned` — the README now includes a concrete fit matrix instead of only
  general-purpose marketing bullets.
- `aligned` — the Quick Start remains tutorial-shaped and worldline-first after
  the positioning changes.
- `aligned` — the new framing is guarded by executable tests, not prose review
  only.

## Drift

There was no semantic drift from the governing design note.

One deliberate scope boundary remains:

- this slice clarified positioning and fit at the top of the README
- it did not yet perform a comparable terminology-and-fit pass over every
  secondary document in the repo

## Why The Adjustment Happened

- hidden pre-existing constraint: earlier README improvements made the repo
  easier to approach, but still left first-contact readers with the wrong
  mental model that WARP was inherently Git-specific
- deliberate tradeoff: the highest-leverage place to fix that confusion was the
  README front matter before deeper docs cleanup

## Resolution

- accepted as the correct slice boundary
- broader docs-corpus positioning cleanup remains follow-on work inside
  `OG-010`

## Verification

- `npx vitest run test/unit/scripts/public-api-readme-shape.test.js test/unit/scripts/read-api-doc-consistency.test.js`
- `npx markdownlint README.md docs/design/readme-warp-positioning-and-fit.md`
- `node scripts/lint-markdown-code-samples.js README.md docs/design/readme-warp-positioning-and-fit.md`
