# 0139 Sync Rate Limiting Retro

## Outcome

`HEX_sync-no-rate-limiting` is closed. Sync auth now owns a per-key
token-bucket admission budget, HTTP sync maps exhausted keys to
`429 RATE_LIMITED`, and non-local bind hosts cannot be configured with
enforced auth unless they also carry an explicit rate-limit budget.

The important correction inside the slice was ordering: rate limiting
runs after signature and nonce verification, not before. That still keeps
graph sync work behind the budget, while preventing bad signatures with a
known key id from burning a valid key's tokens.

## What Went Well

- The REDs were behavioral and direct: auth exhaustion, refill, HTTP `429`,
  and non-local config rejection.
- Time stayed injectable. The domain token bucket does not call wall-clock
  globals.
- The change stayed bounded to sync auth/server admission and public option
  wiring.

## What Was Messy

- The initial design phrasing wanted throttling before signature
  verification. That would have let invalid signatures consume a real
  key's budget, so the test suite forced a better boundary.
- The existing helper file is already close to the lint complexity edge;
  adding one config field required splitting validation and config assembly.
- The original backlog item also mentions response paging and metrics. Those
  are real follow-ups, but not part of this blocker.

## SSJS Scorecard

- Runtime-backed forms for new concepts: pass. `SyncRateLimiter` owns the
  token-bucket behavior.
- Boundary validation stays at boundaries: pass. Zod validates the public
  server auth shape; `SyncRateLimiter` validates runtime invariants.
- Behavior lives on the owner: pass. Admission budgeting is in sync auth, not
  graph processing.
- No message parsing for behaviorally significant branching: pass.
- No ambient time or entropy in new domain code: pass. Time enters through
  `rateLimit.clock`.
- No fake shape trust or cast-cosplay in production code: pass.

## Follow-Up

Pull `HEX_sync-500-sanitization` next. Once that closes, the DAG opens the
near-end quarantine graduation node.

The response paging and payload/latency metrics part of the original note
was split into
`docs/method/backlog/bad-code/HEX_sync-response-paging-and-metrics.md`
for a later release slice.

## Battle Report

We walked into the sync endpoint with a valid-key flood problem and found a
small trapdoor: throttle too early and a forged signature could drain a real
key's budget. The fix was to let auth prove the caller first, then spend the
token before any graph work starts. The next wall is less glamorous and more
important: stop HTTP 500 responses from telling strangers what exploded.
