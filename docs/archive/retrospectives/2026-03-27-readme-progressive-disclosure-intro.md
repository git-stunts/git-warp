# Retrospective: README Progressive Disclosure Intro

**Date:** 2026-03-27
**Legend:** Observer Geometry
**Cycle:** `OG-010`
**Design:** `docs/design/readme-progressive-disclosure-intro.md`, `docs/design/public-api-design-thinking.md`

## What Landed

- Reframed the top of [README.md](../../README.md) for a first-contact reader
  who has never heard of WARP or causal graphs.
- Added plain-language `What Is git-warp?` and `Why Use It?` sections before
  the tutorial material.
- Added a short `Minimal Mental Model` section and an early `Glossary` so core
  nouns appear before the Quick Start relies on them.
- Restructured the Quick Start into a tutorial that explicitly walks through:
  - opening a graph
  - writing data
  - reading a node back
  - querying matching nodes
  - traversing relationships
- Kept the worldline-first read model visible after the tutorial and retained
  explicit cost-signaling for inspection-style whole-state reads.
- Tightened the executable README contract in
  `test/unit/scripts/public-api-readme-shape.test.js` so this structure is now
  enforced by tests.

## Design Alignment Audit

- `aligned` — the README now starts with a plain-language explanation of what
  this repo is before using WARP doctrine as framing.
- `aligned` — the README now explains why someone would choose `git-warp`
  before teaching deeper API usage.
- `aligned` — key nouns are introduced through a mental model and glossary
  before the tutorial relies on them.
- `aligned` — the Quick Start now covers the minimum first-use path:
  write, read back, query, and traverse.
- `aligned` — the README still teaches the worldline-first read boundary rather
  than falling back to whole-graph preload patterns.
- `aligned` — the progressive-disclosure structure is guarded by executable
  tests instead of prose review only.

## Drift

There was no semantic drift from the governing design note.

One deliberate scope boundary remains:

- this slice improved the README opening and tutorial path
- it did not attempt to flatten all later internal sections into the same
  beginner tone, because those sections still serve deeper readers

## Why The Adjustment Happened

- hidden pre-existing constraint: earlier README work had improved doctrine and
  teaching order, but still assumed more WARP context than a first-contact
  GitHub reader actually has
- deliberate tradeoff: this slice focused on the minimum onboarding path rather
  than a full document rewrite

## Resolution

- accepted as the correct slice boundary
- later README/internal-sections cleanup remains follow-on work inside
  `OG-010`

## Verification

- `npx vitest run test/unit/scripts/public-api-readme-shape.test.js test/unit/scripts/read-api-doc-consistency.test.js`
- `node scripts/lint-markdown-code-samples.js README.md`
