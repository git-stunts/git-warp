# Promote TrustRecord from @typedef to class

**Effort:** S

## Problem

`src/domain/trust/TrustStateBuilder.js` defines `TrustRecord` as a
`@typedef {Object}`. Parsed, validated, and chained — full entity
lifecycle. Should be a class.

## Notes

TrustRecord is Zod-parsed from external data. Functions like
`computeSignaturePayload` and `buildState` accept
`Record<string, unknown>`. Promoting to a class requires:
1. Wrap Zod parse output in `new TrustRecord(parsed.data)`
2. Widen consumer signatures or add `toRecord()` on the class

Not blocked — just more touch points than the XS vassals.
