---
cycle: 0139
task_id: HEX_sync-no-rate-limiting
status: Final
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-05
release_home: v17.0.0
---

# Sync Rate Limiting

## Pull

`HEX_sync-no-rate-limiting` is the next open v17 release blocker. The
previous sync security slices made sync secrets opaque and made HTTP sync
serving fail closed for non-local bind hosts, but an authenticated key can
still hammer the sync endpoint as fast as transport and Git allow.

## Playback Questions

1. Can an authenticated key exceed its configured sync admission budget?
2. Does the HTTP sync server return a clear rate-limit response before graph
   sync work executes?
3. Can a non-local sync server be configured without an enforced auth budget?
4. Does the implementation keep wall-clock time outside domain globals?
5. Does this slice avoid broad response paging, storage, or RuntimeHost work?

## Hill

HTTP sync admission is bounded per key id. A configured key receives a
token-bucket budget after successful request authentication and before graph
sync work, and non-local enforced auth must carry an explicit rate-limit
budget. Time enters through an injected clock, not through ambient domain
state.

## User Stories

- As an operator, I can expose a sync endpoint with enforced HMAC auth and a
  configured per-key burst/refill budget.
- As an operator, I get a deterministic `429` response when a key exceeds its
  sync request budget.
- As a library consumer, I cannot accidentally bind a non-local sync endpoint
  with auth but no admission budget.
- As a maintainer, I can test rate-limit behavior with a fake clock instead of
  sleeping or touching wall-clock globals.

## Requirements

1. `SyncAuthService` accepts a rate-limit configuration with:
   - capacity: positive integer burst size,
   - refillTokensPerSecond: positive refill rate,
   - clock: injected `() => number` returning milliseconds.
2. `SyncAuthService.verify()` applies rate limiting by authenticated key id
   after signature and nonce verification but before graph sync work.
3. Exhausted budgets return `{ ok: false, reason: 'RATE_LIMITED', status: 429 }`.
4. Auth metrics include a rate-limit rejection counter.
5. `HttpSyncServer` exposes the same auth rate-limit config and returns `429`
   without calling `graph.processSyncRequest`.
6. Non-local sync hosts require `auth.mode: 'enforce'` and a rate-limit budget.
   Localhost test/development configurations may omit a rate limit.
7. Domain code must not call `Date.now()`, `new Date()`, `performance.now()`,
   timers, or process globals.

## Acceptance Criteria

- RED tests fail before production changes:
  - direct `SyncAuthService` exhaustion returns `429`,
  - bucket refill restores admission,
  - `HttpSyncServer` returns `429` without graph work,
  - non-local enforced auth without a rate-limit budget is rejected.
- GREEN tests pass after implementation.
- Focused validation passes for sync auth/server/controller tests.
- Full validation gates are rerun or explicitly reported if a broader gate is
  still blocked by an unrelated node.
- `CHANGELOG.md`, `docs/API_REFERENCE.md`, `docs/BEARING.md`, DAG CSV, and DAG
  SVG reflect the completed blocker.

## Test Plan

### Goldens

- `SyncAuthService` with capacity `2` admits two signed requests and rejects
  the third request from the same key id with `RATE_LIMITED`.
- Advancing the injected fake clock by one refill interval admits the next
  request.
- `HttpSyncServer` maps auth rate-limit failure to HTTP `429` and preserves the
  canonical JSON error response shape.
- Non-local `host: '0.0.0.0'` with enforced auth and no rate-limit config
  throws during server construction.

### Known Fails

- Response paging and payload-size telemetry remain outside this cycle. They
  are real follow-up work from the original backlog item, but this blocker is
  closed when request admission is bounded by key id.

### Stress And Jitter

- The bucket math clamps negative or non-monotonic clock movement to no refill.
- High refill intervals should not create more than `capacity` tokens.
- Repeated rejected requests should stay rejected until enough injected time
  passes.
- Budgets are keyed by key id, so one key exhausting its budget does not consume
  another configured key's budget.

## Drift Watch

- Do not add ambient time to `src/domain`.
- Do not introduce versioned names in `src/`.
- Do not broaden the slice into RuntimeHost, storage, materialization, or sync
  response paging.
- Do not make tests inspect source or docs text for behavior.

## Playback

1. Can an authenticated key exceed its configured sync admission budget?
   No. `SyncAuthService` tracks token buckets by key id and returns
   `RATE_LIMITED` once a key exhausts its configured capacity.
2. Does the HTTP sync server return a clear rate-limit response before graph
   sync work executes?
   Yes. `HttpSyncServer` maps the auth result to HTTP `429`, and the
   regression test proves `graph.processSyncRequest` is not called.
3. Can a non-local sync server be configured without an enforced auth budget?
   No. Non-local hosts now require `auth.mode: 'enforce'` and
   `auth.rateLimit`.
4. Does the implementation keep wall-clock time outside domain globals?
   Yes. The token bucket reads time only through the injected
   `rateLimit.clock` function.
5. Does this slice avoid broad response paging, storage, or RuntimeHost work?
   Yes. The changes stay in sync auth/server option wiring, public types,
   docs, and tests.

## Implementation

- Added `SyncRateLimiter`, a runtime-backed token bucket keyed by sync auth
  key id.
- Added `auth.rateLimit` to sync serve/auth option surfaces and package
  exports.
- Applied rate limiting only after signature and nonce verification so bad
  signatures cannot spend a valid key's request budget.
- Required explicit `auth.rateLimit` for non-local sync bind hosts.
- Updated API docs, consumer type smoke, CHANGELOG, BEARING, and the v17
  blocker DAG.

## Validation

- RED focused run failed 4 tests:
  `SyncAuthService.test.ts`, `HttpSyncServer.auth.test.ts`, and
  `HttpSyncServer.test.ts`.
- Additional RED proved bad signatures do not spend key budget.
- GREEN focused run:
  `npx vitest run test/unit/domain/services/SyncAuthService.test.ts test/unit/domain/services/HttpSyncServer.auth.test.ts test/unit/domain/services/HttpSyncServer.test.ts`
  passed 3 files and 111 tests.
- Broader focused sync run:
  `npx vitest run test/unit/domain/services/controllers/SyncController.test.ts test/unit/domain/services/SyncController.test.ts test/unit/domain/WarpGraph.syncAuth.test.ts test/unit/domain/services/HttpSyncServer.authorize.test.ts`
  passed 4 files and 124 tests.
- Full gates:
  - `npm run lint`
  - `npm run lint:sludge`
  - `npm run typecheck`
  - `npm run typecheck:consumer`
  - `npm run test:local` passed 438 files and 6770 tests.
  - `npm run lint:md`
  - `npm run lint:md:code`
  - `npm audit --omit=dev --audit-level=high`
  - `git diff --check`

## Closeout

`HEX_sync-no-rate-limiting` is complete. The open blocker front is now
`HEX_sync-500-sanitization`; release cleanup remains blocked behind that
and quarantine graduation.

Backlog addition:

- `docs/method/backlog/bad-code/HEX_sync-response-paging-and-metrics.md`
  preserves the original backlog item's response paging and observability
  follow-up outside the v17 release blocker.
