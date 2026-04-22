---
id: OWN_always-true-null-checks
blocked_by: []
blocks: []
feature: sync-trust-security
---

# Always-true null/undefined checks on non-nullable values

**Effort:** XS

## What's Wrong

Multiple sites check `x !== undefined && x !== null` on values that
can never be null (e.g., `resolvedCrypto` which has a `defaultCrypto`
fallback, `resolvedStateHashService` which is always constructed).
These are dead branches that obscure intent and waste reader attention.
CodeRabbit caught two instances this session.

## Suggested Fix

1. Enable `strictNullChecks` in tsc to flag these automatically.
2. Remove dead branches where the value provably cannot be null.
3. If the value CAN be null, type it correctly (`T | null`). If it
   cannot, don't check.
