# Extract audit/ from domain/services/

Move the 2 audit/trust-verification files into
`src/domain/services/audit/`.

## Files

- AuditReceiptService.js (499)
- AuditVerifierService.js (824)

## Why

Security-boundary code. Small, self-contained, high-trust. Only
outbound dependency is AuditMessageCodec (which moves to codec/).

## Scope

Move files, update imports. No behavioral changes.

## Source

Cycle 0004 analysis.
