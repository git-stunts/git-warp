# 0137 Sync Secret Opaque Value

- Status: `Final`
- Date: 2026-05-05
- Release lane: `v17.0.0`
- Source task: `HEX_sync-secret-plain-string`
- DAG source: [../0124-v17-release-blocker-dag.md](../0124-v17-release-blocker-dag.md)

## Hill

Sync HMAC credentials stop flowing through the sync domain as plain
strings. Callers construct an explicit `SyncSecret`, domain auth and
transport ports carry that opaque value, and accidental stringification,
JSON serialization, or inspection redacts the secret.

## User Stories

- As an operator, if a sync auth config is accidentally logged or
  serialized, the shared secret does not appear in output.
- As an API consumer, sync auth makes the sensitive boundary visible:
  I pass `SyncSecret.fromString(...)` instead of an anonymous string.
- As a maintainer, later production-auth and rate-limit work can depend
  on a stable key identity shape without plain credential values drifting
  through controller options.

## Requirements

- Add a runtime-backed `SyncSecret` class with redacted `toString()`,
  `toJSON()`, and Node inspect behavior.
- Make sync client/server auth options and sync auth service keys require
  `SyncSecret`, not `string`.
- Keep HMAC signing behavior byte-compatible for the same raw secret.
- Export `SyncSecret` from package entry points that expose sync.
- Update public docs and sync tests to use `SyncSecret.fromString(...)`.
- Do not add secret-specific legacy or versioned names to main `src/`.

## Acceptance Criteria

- Behavioral REDs fail before implementation:
  - `SyncSecret` redacts in string, JSON, and inspect paths.
  - `signSyncRequest()` signs with `SyncSecret` and remains verifiable.
  - Sync auth APIs reject or fail typecheck for plain string secrets.
- Existing sync auth tests pass after switching fixtures to
  `SyncSecret`.
- `npm run typecheck:consumer` proves the public surface rejects plain
  sync secret strings and accepts `SyncSecret`.
- DAG marks `HEX_sync-secret-plain-string` complete and unlocks
  `HEX_sync-production-auth-defaults`.

## Test Plan

### RED

```sh
npx vitest run test/unit/domain/services/SyncSecret.test.ts \
  test/unit/domain/services/SyncAuthService.test.ts
npm run typecheck:consumer
```

Expected first result: missing/incorrect `SyncSecret` behavior and public
type failures until the opaque value exists and sync auth types require
it.

### GREEN

```sh
npx vitest run test/unit/domain/services/SyncSecret.test.ts \
  test/unit/domain/services/SyncAuthService.test.ts \
  test/unit/domain/services/HttpSyncServer.auth.test.ts \
  test/unit/domain/services/HttpSyncServer.authorize.test.ts \
  test/unit/domain/services/HttpSyncServer.test.ts \
  test/unit/domain/WarpGraph.syncAuth.test.ts \
  test/unit/domain/services/SyncController.test.ts \
  test/unit/domain/services/controllers/SyncController.test.ts
```

Final result: 8 passed files and 228 passed tests.

```sh
npm run test:local
```

Final result: 438 passed files and 6760 passed tests.

### Goldens

- `String(secret)` returns `[REDACTED]`.
- `JSON.stringify({ secret })` returns a redacted value.
- Node inspect renders `[REDACTED]`.
- HMAC headers generated with `SyncSecret.fromString("s")` verify
  against a server configured with the same `SyncSecret`.
- Plain `auth.secret: "s"` and `auth.keys.default: "s"` fail consumer
  typecheck.

### Known Fails Outside This Cycle

- Non-local sync auth defaults are still optional until
  `HEX_sync-production-auth-defaults`.
- Rate limiting remains under `HEX_sync-no-rate-limiting`.
- Sanitized HTTP 500 responses remain under `HEX_sync-500-sanitization`.
- Quarantine graduation remains near-end release work.

### Stress / Jitter

- Default key ID and explicit key ID.
- Multiple keys.
- Log-only and enforce modes.
- Direct HTTP adapter signing and controller-mediated signing.

## Playback Questions

1. Does sync auth carry `SyncSecret` across domain and port boundaries?
   Yes. `SyncWithOptions`, serve auth keys, `SyncAuthService`,
   `SyncHttpAuth`, and HTTP adapter signing now carry `SyncSecret`.
2. Does redaction cover string, JSON, and inspect output?
   Yes. `String(secret)`, `JSON.stringify({ secret })`, and Node
   `inspect(secret)` return `[REDACTED]`.
3. Does signing still verify with the same underlying secret?
   Yes. The focused auth suites verify signed requests and real HTTP
   sync with matching keys.
4. Do docs and consumer types teach the new boundary?
   Yes. `docs/API_REFERENCE.md` uses `SyncSecret.fromString(...)`, and
   `test/type-check/consumer.ts` accepts `SyncSecret` while rejecting
   plain strings for sync secrets and key maps.
5. Which DAG nodes opened after this one closed?
   `HEX_sync-production-auth-defaults` is now open.

## Implementation Notes

- Added `SyncSecret` as a frozen runtime-backed class with a private raw
  value and an HMAC method.
- Updated public sync auth types so secrets and server key maps require
  `SyncSecret`.
- Updated sync auth service validation to reject non-`SyncSecret` key
  values at runtime.
- Updated HTTP client signing and sync controller wiring to pass
  `SyncSecret` through the port boundary.
- Exported `SyncSecret` from package and browser entry points.

## Validation

- `npx vitest run test/unit/domain/services/SyncSecret.test.ts test/unit/domain/services/SyncAuthService.test.ts test/unit/domain/services/HttpSyncServer.auth.test.ts test/unit/domain/services/HttpSyncServer.authorize.test.ts test/unit/domain/services/HttpSyncServer.test.ts test/unit/domain/WarpGraph.syncAuth.test.ts test/unit/domain/services/SyncController.test.ts test/unit/domain/services/controllers/SyncController.test.ts`
- `npm run test:local`
- `npm run typecheck`
- `npm run typecheck:consumer`
- `npm run lint`
- `npm run lint:sludge`
- `npm run lint:md`
- `npm run lint:md:code`
- `npm audit --omit=dev --audit-level=high`
- `git diff --check`

All commands passed after closeout docs were finalized.

## Drift

- Production sync auth defaults are still optional and must be hardened
  in the next node.
- Rate limiting and sanitized 500 responses remain blocked behind
  production auth defaults.

## Non-Goals

- Do not enforce auth for non-local bind hosts in this slice.
- Do not add rate limiting in this slice.
- Do not sanitize 500 responses in this slice.
- Do not introduce key rotation or a keystore.
