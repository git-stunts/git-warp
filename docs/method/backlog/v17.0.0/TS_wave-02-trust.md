---
id: TS_wave-02-trust
blocks: []
blocked_by: []
---

# Wave 2: trust/ (8 files, 1441 LOC)

Cryptographic verification layer. Self-contained — only depends on
CryptoPort and codec boundary. No host-bag coupling.

| # | File | LOC | Notes |
|---|------|-----|-------|
| 1 | verdict.js | 42 | Trust verdict constants |
| 2 | TrustCanonical.js | 47 | Canonical hash helpers |
| 3 | canonical.js | 68 | Canonical serialization |
| 4 | reasonCodes.js | 78 | Error reason code registry |
| 5 | schemas.js | 202 | Zod schemas for trust records |
| 6 | TrustEvaluator.js | 248 | Evaluates trust assertions |
| 7 | TrustStateBuilder.js | 346 | Builds trust state from records |
| 8 | TrustRecordService.js | 410 | Service orchestrating trust lifecycle |

**SSTS focus:** P1 (runtime-backed verdict/assessment types), P2 (boundary validation via schemas), P7 (dispatch on trust verdict classes, not string codes).
