# AuditReceiptService uses raw Error (18 occurrences)

**Effort:** S

## Problem

All validation and CAS errors in `AuditReceiptService.js` throw
plain `Error` instead of a domain error class. Should use a
dedicated `AuditError` (which doesn't exist yet) or `PatchError`
for validation failures and `PersistenceError` for CAS conflicts.
