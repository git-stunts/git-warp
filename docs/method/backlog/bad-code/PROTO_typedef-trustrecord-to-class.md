# Promote TrustRecord from @typedef to class

**Effort:** S

## Problem

`src/domain/trust/TrustStateBuilder.js` defines `TrustRecord` as a
`@typedef {Object}`. Parsed, validated, and chained — full entity
lifecycle. Should be a class.
