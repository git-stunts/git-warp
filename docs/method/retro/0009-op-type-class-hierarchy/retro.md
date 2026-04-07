# Cycle 0009 Retro — Op Type Class Hierarchy

## Hill

Replace 8 typedef ops with a frozen class hierarchy for runtime
identity, constructor validation, and `instanceof` dispatch.

## Outcome

**Hill met.**

## What went well

- RED→GREEN was fast. The class pattern (Dot.js precedent) is
  well-established in this codebase.
- Edge types needed options objects for `max-params` compliance —
  caught by lint, fixed immediately. Clean API.
- The factory function delegation was seamless. Existing tests only
  needed Dot instance updates (they were passing plain objects with
  wrong field names — `writer`/`seq` instead of `writerId`/`counter`
  — hidden by `/** @type {any} */` casts).
- noCoordination suite passed first try. Zero behavioral change.

## What went wrong

- Test for `applyWithReceipt` / `applyWithDiff` had wrong return
  type assumptions (expected direct receipt, got `{state, receipt}`).
  Fixed in-flight. Should have read the function signatures first.
- `new VersionVector()` without args silently creates a broken
  instance (`#entries` is undefined). Used `VersionVector.empty()`
  instead. This is a latent P2 violation — constructor should reject
  missing args.

## Drift check

- No undocumented drift. All changes trace to playback questions.
- Slices 4-5 (consumer `instanceof` migration, CBOR hydration)
  explicitly deferred in the design doc.

## New debt

- `VersionVector()` constructor accepts undefined entries without
  throwing (P2 violation). Filed as bad-code item.

## New backlog

- `PROTO_op-consumer-instanceof-migration.md` — Slice 4: convert
  MessageSchemaDetector, text presenter, TickReceipt to `instanceof`.
- `PROTO_cbor-op-hydration.md` — Slice 5: CBOR decode boundary
  produces Op class instances instead of plain objects.

## Stats

- 10 new source files (710 LOC)
- 4 new test files (97 tests)
- 35 existing tests updated
- 5504 total tests passing
