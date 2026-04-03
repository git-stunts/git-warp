# Promote TrustRecord from @typedef to class

**Effort:** M (upgraded from S — root cause is deeper than the typedef)

## Problem

The entire trust pipeline operates on `Record<string, unknown>` — the
JavaScript equivalent of `any` in a trench coat. Trust records are
CBOR-decoded to `unknown`, cast to `Record<string, unknown>`, and
passed through 20+ function signatures in that form across 5 files:

- `TrustRecordService.js` — 10 occurrences
- `TrustCanonical.js` — 3 occurrences
- `TrustStateBuilder.js` — 1 occurrence
- `TrustEvaluator.js` — 1 occurrence
- `schemas.js` — 4 occurrences

The `TrustRecord` typedef exists but is never enforced at the decode
boundary. Every consumer does bracket access and manual casting
because the type system says "bag of unknowns."

## Root cause

`codec.decode()` returns `unknown`. The trust pipeline casts to
`Record<string, unknown>` and never narrows further. The Zod schema
(`TrustRecordSchema`) validates the shape but doesn't produce a
typed output that propagates — the parse result is immediately
consumed and the validated shape is lost.

## Fix

1. Create `TrustRecord` class in `TrustStateBuilder.js` (or own file)
2. At the CBOR decode boundary in `TrustRecordService.js`, Zod-parse
   then wrap: `new TrustRecord(parsed.data)`
3. Replace all `Record<string, unknown>` signatures downstream with
   `TrustRecord`
4. `computeSignaturePayload`, `computeRecordId`, `verifyRecordId` in
   `TrustCanonical.js` — accept `TrustRecord` instead of
   `Record<string, unknown>`
5. `buildState` in `TrustStateBuilder.js` — accept `TrustRecord[]`
6. Schema validators in `schemas.js` — accept `TrustRecord`

The class eliminates bracket access, manual casts, and the pretense
that we don't know what a trust record looks like.
