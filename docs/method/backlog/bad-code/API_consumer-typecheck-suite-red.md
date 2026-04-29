---
id: API_consumer-typecheck-suite-red
blocked_by: []
blocks: []
feature: public-api-surface
release_home: v17.0.0
---

# Consumer type-check suite is red

**Effort:** M

## Problem

`npm run typecheck:consumer` is red for broad public-surface issues that
predate the 0102 snapshot API model repair. The suite currently reports
missing package-root exports, missing Bun/Deno global declarations,
missing `@git-stunts/trailer-codec` declarations, and stale consumer
examples for older BTR/provenance APIs.

0102 added focused conformance coverage for the new snapshot public API
surface, but the full consumer suite cannot yet be used as a reliable
release gate.

## Acceptance

- Make `npm run typecheck:consumer` pass.
- Decide which root exports are intentional public API and which
  consumer fixture imports are stale.
- Provide declarations or scoped test configuration for Bun, Deno, and
  `@git-stunts/trailer-codec` where needed.
- Update BTR/provenance consumer examples to the current public API.
- Keep focused snapshot public API conformance coverage.

## Source

Created during 0102 GREEN correction because the cycle changed public
snapshot return types while the broad consumer type-check suite was
already red for unrelated public-surface debt.
