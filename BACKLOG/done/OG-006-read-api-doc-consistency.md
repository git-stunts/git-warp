# OG-006 — Remove Remaining Docs And Examples That Imply Caller Retargeting

Status: DONE

Promoted to: `docs/design/read-api-doc-consistency.md`

Closed by:

- `test/unit/scripts/read-api-doc-consistency.test.js`
- `docs/archive/retrospectives/2026-03-27-read-api-doc-consistency.md`

## Problem

Some docs and examples may still imply that `materializeCoordinate()` or
`materializeStrand()` retarget the caller graph instance.

## Why This Matters

Tests now encode the safer contract. The prose surface should stop teaching the
old semantics.

## Promotion Trigger

Promoted when the public read-surface documentation reconciliation pass began.
