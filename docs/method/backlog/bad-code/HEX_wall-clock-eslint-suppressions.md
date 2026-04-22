---
id: HEX_wall-clock-eslint-suppressions
blocked_by: []
blocks: []
feature: observer-admission-runtime
release_home: v19.0.0
---

# 5 eslint-disable suppressions bypass the wall-clock ban in domain

**Effort:** S

The ESLint rule `no-restricted-syntax` correctly bans `Date.now()`,
`new Date()`, and `Date()` in `src/domain/**/*.js`. But 5 files
suppress it with `eslint-disable-next-line`:

1. `AuditReceiptService.js:370` — `Date.now()` for audit timestamp
2. `AuditVerifierService.js:328` — `new Date().toISOString()` for
   verifiedAt field
3. `SyncAuthService.js:59` — `Date.now()` for HMAC timestamp
4. `SyncAuthService.js:181` — `Date.now()` fallback for HMAC
   verification
5. `BoundaryTransitionRecord.js:231` — `new Date().toISOString()`
   default for BTR timestamp

All use the pattern `timestamp = injected || Date.now()`. The
fallback defeats the purpose of the ban — if no one injects,
the domain reaches for the system clock.

## What's wrong

Wall clock is non-deterministic. It breaks:
- Replay determinism (same patches, different timestamps)
- Test reproducibility (tests depend on when they run)
- Cross-writer consistency (different machines, different clocks)

## Suggested fix

Remove every suppression. Make timestamp a required parameter or
inject it through ClockPort. If the caller doesn't provide a
timestamp, that's the caller's problem, not the domain's. The
domain must never reach for the system clock.
