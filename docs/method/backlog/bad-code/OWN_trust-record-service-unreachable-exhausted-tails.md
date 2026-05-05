---
id: OWN_trust-record-service-unreachable-exhausted-tails
blocked_by: []
blocks: []
feature: merge-strands-worldlines
release_home: v19.0.0
---

# PROTO_trust-record-service-unreachable-exhausted-tails

## What stinks

`src/domain/trust/TrustRecordService.js` still ends both bounded retry loops with fallback throws:

- `appendRecordWithRetry()` line 280
- `_persistRecord()` line 407

Both sit after loops that already either `return`, `throw` on exhaustion, or `throw` on real CAS conflict.

## Why it matters

- Coverage time gets wasted chasing branches that the current control flow cannot honestly reach.
- The extra throws suggest uncertainty about the function contracts even though the loops are already total.
- Dead tails make it harder to tell whether a retry policy is deliberate or just defensive residue.

## Suggested direction

- Delete the unreachable tail throws, or
- replace them with explicit assertions documenting why the code should be impossible to reach.

## Evidence

- After the cycle 0010 trust coverage tranche, `TrustRecordService.js` was reduced to exactly these two remaining uncovered lines while all reachable retry, CAS conflict, signature, read, and verification paths were covered.
