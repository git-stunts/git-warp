# Retrospective: Read API Documentation Consistency

**Date:** 2026-03-27
**Legend:** Observer Geometry
**Cycle:** Public read-surface documentation
**Backlog:** `OG-006`
**Design:** `docs/design/read-api-doc-consistency.md`

## What Landed

- Added `test/unit/scripts/read-api-doc-consistency.test.js` as a docs-policy
  spec for the public read surface.
- Updated `README.md` so the public observer examples now start from
  `worldline()` for pinned historical and working-set reads.
- Updated `docs/GUIDE.md` so the advanced read boundary teaches `Worldline` as
  the explicit history handle and describes pinned materialization as detached
  replay.
- Updated `docs/WORKING_SETS.md` so speculative-lane docs now show
  `worldline(...).observer(...)` alongside raw state materialization.

## Design Alignment Audit

- `aligned` — the public docs now teach `worldline()` as the explicit pinned
  read handle.
- `aligned` — at least one observer example in each targeted public doc now
  flows through `worldline(...).observer(...)`.
- `aligned` — coordinate and working-set materialization are now described as
  detached immutable snapshots.
- `aligned` — the public docs now say those reads do not retarget the caller
  runtime.
- `aligned` — the targeted public docs continue to avoid the legacy
  `WarpGraph` noun.
- `aligned` — the slice closed with an executable docs-policy spec rather than
  relying on prose review alone.

## Drift

There was no semantic drift from the governing design note.

One implementation choice was narrower than the design could have allowed:

- the policy test targets `README.md`, `docs/GUIDE.md`, and
  `docs/WORKING_SETS.md` only
- it does not attempt to normalize historical RFCs or internal design notes

## Why The Adjustment Happened

- deliberate tradeoff: OG-006 was scoped to the public contract docs, and
  expanding the guard to older design provenance notes would have turned this
  slice into repo-wide historical cleanup

## Resolution

- accepted as the correct scope for this cycle
- older design-doc wording remains follow-on work, not drift inside OG-006

## Verification

- `npx vitest run test/unit/scripts/read-api-doc-consistency.test.js`
- `node scripts/lint-markdown-code-samples.js README.md docs/GUIDE.md docs/WORKING_SETS.md`
