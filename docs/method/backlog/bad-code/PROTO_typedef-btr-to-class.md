# Promote BTR from @typedef to class

**Effort:** S

## Problem

`src/domain/services/BoundaryTransitionRecord.js` defines `BTR` as a
`@typedef {Object}`. Tamper-evident package — constructed, frozen,
verified, serialized. Should be a class.
