# 0138 Sync Production Auth Defaults

- Status: `Final`
- Date: 2026-05-05
- Release lane: `v17.0.0`
- Source task: `HEX_sync-production-auth-defaults`
- DAG source: [../0124-v17-release-blocker-dag.md](../0124-v17-release-blocker-dag.md)

## Hill

The built-in HTTP sync server fails closed by default. Non-local bind
hosts require enforced auth with configured `SyncSecret` keys, and
unauthenticated localhost serving requires an explicit unsafe option.

## User Stories

- As an operator, binding sync to `0.0.0.0` without enforced auth fails
  before the server starts.
- As a local developer, I can still run an unauthenticated localhost sync
  server, but only by naming the unsafe choice in options.
- As a maintainer, rate limiting and 500 sanitization can assume the
  server-default auth posture is explicit rather than accidental.

## Requirements

- Add `unsafeAllowUnauthenticatedLocalhost?: boolean` to sync serve
  options.
- Reject missing auth unless the bind host is local and the unsafe option
  is `true`.
- Reject non-local bind hosts unless `auth.mode` is `enforce`.
- Preserve existing `auth.mode: "enforce"` behavior and local
  development ergonomics when the unsafe flag is explicit.
- Keep rate limiting out of this cycle; that remains
  `HEX_sync-no-rate-limiting`.
- Keep HTTP 500 sanitization out of this cycle; that remains
  `HEX_sync-500-sanitization`.

## Acceptance Criteria

- RED tests prove:
  - localhost without auth and without unsafe flag rejects.
  - localhost without auth and with unsafe flag serves.
  - non-local without auth rejects even with unsafe flag.
  - non-local with `auth.mode: "log-only"` rejects.
  - non-local with enforced `SyncSecret` keys serves.
- Public docs show the secure default and explicit unsafe localhost
  development mode.
- DAG marks `HEX_sync-production-auth-defaults` complete and unlocks
  `HEX_sync-no-rate-limiting` and `HEX_sync-500-sanitization`.

## Test Plan

### RED

```sh
npx vitest run test/unit/domain/services/HttpSyncServer.test.ts \
  test/unit/domain/services/controllers/SyncController.test.ts \
  test/unit/domain/WarpGraph.syncAuth.test.ts
npm run typecheck:consumer
```

Expected first result: tests fail because no unsafe localhost option
exists and unauthenticated serving still defaults open.

### GREEN

```sh
npx vitest run test/unit/domain/services/HttpSyncServer.test.ts \
  test/unit/domain/services/HttpSyncServer.auth.test.ts \
  test/unit/domain/services/HttpSyncServer.authorize.test.ts \
  test/unit/domain/WarpGraph.syncAuth.test.ts \
  test/unit/domain/WarpGraph.serve.test.ts \
  test/unit/domain/services/controllers/SyncController.test.ts
```

Final result: 6 passed files and 134 passed tests.

```sh
npm run test:local
```

Final result: 438 passed files and 6765 passed tests.

### Goldens

- Local unauthenticated dev requires
  `unsafeAllowUnauthenticatedLocalhost: true`.
- Non-local bind hosts require `auth.mode: "enforce"` with non-empty
  `SyncSecret` keys.
- Authenticated local and non-local serving remain supported.
- Existing signed HTTP sync behavior still passes.

### Known Fails Outside This Cycle

- Per-key rate limiting remains under `HEX_sync-no-rate-limiting`.
- Sanitized HTTP 500 responses remain under `HEX_sync-500-sanitization`.
- Quarantine graduation remains near-end release work.

### Stress / Jitter

- Hosts: `127.0.0.1`, `localhost`, `::1`, `0.0.0.0`, and arbitrary
  non-local names.
- Auth modes: omitted, `enforce`, `log-only`.
- Unsafe flag: omitted, false, true.

## Playback Questions

1. Does non-local no-auth serving fail closed?
   Yes. Non-local no-auth serving rejects with
   `sync auth is required for non-local sync hosts`.
2. Does non-local log-only auth fail closed?
   Yes. Non-local `auth.mode: "log-only"` rejects with
   `non-local sync hosts require auth.mode "enforce"`.
3. Does local no-auth serving require the unsafe option?
   Yes. Local no-auth serving rejects unless
   `unsafeAllowUnauthenticatedLocalhost: true` is set.
4. Do public docs and consumer types show the new option?
   Yes. The API reference documents secure defaults and the consumer
   typecheck uses the unsafe flag for no-auth local serving.
5. Which DAG nodes open after this one closes?
   `HEX_sync-no-rate-limiting` and `HEX_sync-500-sanitization` are open.

## Implementation Notes

- Added `unsafeAllowUnauthenticatedLocalhost` to sync serve options.
- Hardened `HttpSyncServer` option parsing so direct server construction
  and public `serve()` use the same fail-closed defaults.
- Recognized `localhost`, `127.0.0.1`, `::1`, and `[::1]` as local bind
  hosts.
- Kept `auth.mode: "log-only"` available for local diagnostics, but
  rejected it for non-local hosts.

## Validation

- `npx vitest run test/unit/domain/services/HttpSyncServer.test.ts test/unit/domain/services/HttpSyncServer.auth.test.ts test/unit/domain/services/HttpSyncServer.authorize.test.ts test/unit/domain/WarpGraph.syncAuth.test.ts test/unit/domain/WarpGraph.serve.test.ts test/unit/domain/services/controllers/SyncController.test.ts`
- `npm run test:local`
- `npm run typecheck`
- `npm run typecheck:consumer`
- `npm run lint`
- `npm run lint:sludge`
- `npm run lint:md`
- `npm run lint:md:code`
- `git diff --check`

All commands passed.

## Drift

- Per-key rate limiting is now open.
- Sanitized HTTP 500 responses are now open.

## Non-Goals

- Do not implement rate limiting.
- Do not sanitize HTTP 500 responses.
- Do not introduce key rotation or a keystore.
