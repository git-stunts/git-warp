# 15 eslint-disable comments mask domain determinism violations

**Effort:** M
**Audit ref:** Comparison report, hidden finding #1

The ESLint rule `no-restricted-syntax` correctly bans `Date.now()`,
`new Date()`, `Math.random()`, `setTimeout`, and `setInterval` in
`src/domain/`. The lint gate passes with 0 errors. But 15 individual
`eslint-disable-next-line` comments suppress the rule across domain
services:

| File | Count | What's suppressed |
|------|-------|-------------------|
| `IndexRebuildService.ts` | 5 | Wall clock (Date.now) |
| `AuditReceiptService.ts` | 1 | Wall clock (Date.now) |
| `AuditVerifierService.ts` | 1 | Wall clock (new Date) |
| `SyncAuthService.ts` | 2 | Wall clock (Date.now) |
| `btrOperations.ts` | 1 | Wall clock (new Date) |
| `executeGC.ts` | 2 | Wall clock (Date.now) |
| `SubscriptionController.ts` | 1 | Timer (setInterval) |
| `ForkController.ts` | 1 | Randomness (Math.random) |
| `MaterializedViewVerifier.ts` | 1 | Randomness (Math.random) |

The gate looks GREEN. The invariant is RED. "0 lint errors" does not
mean "policy holds" — it means "policy holds except where we said
it doesn't."

## Suggested Fix

For each suppression:
1. Inject the dependency via ClockPort, CryptoPort, or SchedulerPort.
2. Remove the `eslint-disable` comment.
3. Track the count: when it reaches 0, the invariant actually holds.

Consider adding a ratchet (like IRONCLAD M9) that counts
`eslint-disable.*no-restricted-syntax` in `src/domain/` and blocks
increases.
