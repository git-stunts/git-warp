---
id: CLEANUP_old-trust-record-service
blocks: []
blocked_by: []
---

# Delete old TrustRecordService.js + rewrite its tests

## What

`src/domain/trust/TrustRecordService.js` (410 LOC) is replaced by:
- `src/domain/trust/TrustRecordService.ts` (151 LOC) — domain validation
- `src/infrastructure/adapters/GitTrustChainAdapter.ts` (426 LOC) — git-cas + plumbing
- `src/ports/TrustChainPort.ts` (69 LOC) — port contract

The old `.js` file still exists because 4 test files and 2 bats helpers
import it directly. Production code no longer uses it.

## Files to update

1. Delete `src/domain/trust/TrustRecordService.js`
2. Rewrite or delete:
   - `test/unit/domain/trust/TrustRecordService.test.js`
   - `test/unit/domain/trust/TrustRecordService.chain.test.js`
   - `test/unit/domain/trust/TrustRecordService.cas.test.js`
   - `test/unit/domain/trust/TrustRecordService.convergence.test.js`
3. Update bats helpers:
   - `test/bats/helpers/seed-trust.js`
   - `test/bats/helpers/seed-trust-sync.js`
4. Remove from `eslint.config.js` relaxed complexity list
5. Remove `TrustRecordSchema` from `schemas.ts` (only used by old service)
6. Update `docs/method/backlog/asap/PROTO_typedef-trustrecord-to-class.md` — done
