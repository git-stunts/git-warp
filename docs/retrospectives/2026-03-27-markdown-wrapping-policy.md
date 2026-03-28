# Retrospective: Markdown Wrapping Policy

**Date:** 2026-03-27
**Legend:** Observer Geometry
**Cycle:** `OG-010`
**Design:** `docs/design/markdown-wrapping-policy.md`

## What Landed

- Made the repo's Markdown wrapping policy explicit in
  [.markdownlint.jsonc](../../.markdownlint.jsonc) by setting `MD013` to
  `false`.
- Kept `MD040` enabled so fenced code blocks still require language labels.
- Reflowed the README front matter so the source reflects the intended no-hard-wrap prose policy.
- Added an executable config test so future config changes cannot silently
  reintroduce a line-length rule by accident.

## Design Alignment Audit

- `aligned` — the repo now explicitly states that Markdown prose should not be
  hard-wrapped for linting reasons.
- `aligned` — fenced code block language enforcement remains enabled.
- `aligned` — the source of the README now better matches the policy.
- `aligned` — the policy is guarded by an executable test instead of config
  inspection only.

## Drift

There was no semantic drift from the governing design note.

One deliberate scope boundary remains:

- this slice reflowed the README front matter only
- it did not reformat every historical Markdown file in the repo

## Why The Adjustment Happened

- hidden pre-existing constraint: contributors could easily mistake the repo's
  Markdown style for a line-length-linter requirement even though that rule was
  not actually active
- deliberate tradeoff: make policy explicit first, then reflow only the
  highest-traffic Markdown surface

## Resolution

- accepted as the correct slice boundary
- broader Markdown source reflow remains optional cleanup, not a requirement

## Verification

- `npx vitest run test/unit/scripts/markdownlint-config.test.js`
- `npx markdownlint README.md docs/design/markdown-wrapping-policy.md docs/retrospectives/2026-03-27-markdown-wrapping-policy.md`
- `node scripts/lint-markdown-code-samples.js README.md`
