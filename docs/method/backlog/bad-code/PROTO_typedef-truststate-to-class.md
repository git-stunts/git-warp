# Promote TrustState from @typedef to class

**Effort:** S

## Problem

`src/domain/trust/TrustStateBuilder.js` defines `TrustState` as a
`@typedef {Object}`. Built by `buildState`, frozen, queried by
TrustEvaluator. Maps of bindings/keys. Should be a class.
