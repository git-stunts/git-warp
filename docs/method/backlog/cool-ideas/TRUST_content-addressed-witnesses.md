---
id: TRUST_content-addressed-witnesses
---

# Content-addressed witnesses in git-cas

When the admission kernel ships, every admission produces a witness
explaining WHY the outcome is lawful. Full witnesses could be large —
especially for braid collapse with many cells.

Store witnesses as content-addressed blobs in git-cas:

- Automatic dedup (identical witnesses across similar admissions)
- Streaming restore for large witnesses
- References in receipts/BTRs are just OIDs — compact
- git-cas handles integrity at the storage layer

The receipt carries the witness OID. The full witness is lazy-loaded
on demand. This keeps receipts small while making witnesses available
for audit, replay, and provenance queries.
