# SyncProtocol uses raw Error with manual code property

**Effort:** XS

## Problem

`SyncProtocol.js` (~line 233) constructs `new Error()` then manually
casts to `Error & { code: string }`. Should use `SyncError` from
domain errors.
