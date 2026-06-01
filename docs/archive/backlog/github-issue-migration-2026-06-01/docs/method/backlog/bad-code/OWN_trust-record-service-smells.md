---
id: OWN_trust-record-service-smells
blocked_by: []
blocks: []
feature: sync-trust-security
release_home: v17.0.0
---

# TrustRecordService has multiple code smells

**Effort:** M

## What's wrong

- Magic string `'record.cbor'` used in `_readTip` and `readRecords`. No named constant.
- P5 violation: commit message formatting (`'trust: ${rType} ${rId}'`) and `mktree` entry formatting leak serialization concerns into a domain service.
- `readRecords` returns `{ok, error}` tagged union instead of a result class (P3 + P7 violation).
- Constructor does not validate `persistence` or `codec` inputs (P2 violation).

## Suggested fix

- Extract named constants for magic strings (`RECORD_BLOB_NAME`, etc.).
- Move tree/commit formatting to an infrastructure adapter behind a port.
- Replace tagged union with `ReadRecordsSuccess` / `ReadRecordsFailure` result classes using `instanceof` dispatch.
- Add constructor validation for required dependencies.
