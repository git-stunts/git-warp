# Migrate op consumers to instanceof dispatch

**Effort:** S

## Problem

Cycle 0009 shipped Op class hierarchy but consumers still use string
comparison (`op.type === 'NodeAdd'`). Convert to `instanceof`:

- `MessageSchemaDetector.js` — 2 string checks
- `bin/presenters/text.js` — 8 string checks
- `TickReceipt.js` — `OP_TYPES` array

## Notes

Blocked on CBOR hydration (ops from disk are still plain objects).
Can proceed incrementally per-file once hydration ships.

## Source

Cycle 0009 retro, Slice 4 deferral.
