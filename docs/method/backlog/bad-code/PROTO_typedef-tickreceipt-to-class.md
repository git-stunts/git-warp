# Promote TickReceipt from @typedef to class

**Effort:** S

## Problem

`src/domain/types/TickReceipt.js` defines `TickReceipt` as a
`@typedef {Object}` with a factory (`createTickReceipt`), validation,
canonical JSON serialization, and public export. Should be a class.
Part of the public API surface.
