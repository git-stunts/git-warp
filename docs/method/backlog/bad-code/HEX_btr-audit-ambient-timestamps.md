---
id: HEX_btr-audit-ambient-timestamps
blocked_by: []
blocks: []
feature: observer-admission-runtime
release_home: v19.0.0
---

# BoundaryTransitionRecord and AuditService use ambient wall-clock

**Effort:** S

Three domain files default to wall-clock timestamps when the caller
doesn't provide one:

- `BoundaryTransitionRecord.js:232` — `timestamp = new Date().toISOString()`
- `AuditReceiptService.js:371` — `timestamp = Date.now()`
- `AuditVerifierService.js:329` — `verifiedAt: new Date().toISOString()`

These are observational wall time — metadata about when the outside
world observed an event. They belong at the adapter boundary, not
as defaults in domain services.

Violates `no-ambient-time` invariant.

## Suggested fix

Make timestamp a required parameter in each case. The CLI, HTTP
handler, or adapter provides the wall-clock timestamp at the
boundary. The domain service receives it as data, never generates it.
