---
cycle: 0140
task_id: HEX_sync-500-sanitization
status: Final
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-05
release_home: v17.0.0
---

# Sync 500 Sanitization

## Pull

`HEX_sync-500-sanitization` is the only open security-hardening DAG node
after `0139-sync-rate-limiting`. The current HTTP sync server catches graph
sync failures and returns the thrown error message in the HTTP `500` body.
That can leak internal paths, secrets, storage details, or operational state
to remote sync clients.

## Playback Questions

1. Does an internal `processSyncRequest` failure return a stable generic
   response to clients?
2. Is the original error still observable through `LoggerPort`?
3. Are intentional 4xx protocol, auth, route, and request-size responses still
   specific and actionable?
4. Does this slice avoid changing sync protocol success semantics?
5. Does the release DAG open quarantine graduation after this node closes?

## Hill

HTTP sync `500` responses do not expose internal exception messages. Clients
receive a stable error code and generic message, while operators can still
inspect the underlying failure through structured logs.

## User Stories

- As a remote sync client, I get a stable `500` response shape that does not
  reveal server internals.
- As an operator, I can inspect logs to understand the actual thrown error.
- As a maintainer, I can keep 4xx client-facing failures specific while
  sanitizing only unexpected server failures.

## Requirements

1. `HttpSyncServer` returns a generic `500` body for unexpected graph sync
   failures:
   - `error: "Sync failed"`
   - `code: "E_SYNC_INTERNAL"`
2. The raw thrown message must not appear in the HTTP response body.
3. The raw `Error` object is logged through `LoggerPort.error`.
4. `HttpSyncServer` accepts an optional top-level logger, and
   `SyncServerLauncher` passes the host logger when one exists.
5. Existing `400`, `401`, `403`, `404`, `405`, `413`, and `429` responses
   remain specific.
6. No storage, RuntimeHost, materialization, or sync protocol response shape
   changes beyond the sanitized `500` error body.

## Acceptance Criteria

- RED tests fail before production changes:
  - thrown graph error returns generic body with `E_SYNC_INTERNAL`,
  - body does not include the thrown internal message,
  - logger receives the internal error,
  - 4xx responses still keep their current bodies.
- GREEN tests pass after implementation.
- Focused validation passes for HTTP sync server tests.
- Full validation gates are rerun or explicitly reported.
- DAG CSV/DOT/SVG mark `HEX_sync-500-sanitization` complete and show
  `REL_quarantine-graduate-clean` as open.

## Test Plan

### Goldens

- `processSyncRequest` throws `new Error("secret backend path")`; HTTP response
  is `500` with `{ code: "E_SYNC_INTERNAL", error: "Sync failed" }`.
- The same failure calls `logger.error` with a structured field containing the
  original `Error`.
- Route, content-type, malformed request, auth, body-size, and rate-limit
  failures keep their existing status and error text.

### Known Fails

- This slice does not build a full observability dashboard. It only prevents
  internal exception disclosure and preserves operator visibility through the
  existing logger port.

### Stress And Jitter

- Non-`Error` throws still return the same sanitized `500` body.
- Repeated failures should not mutate server state or change response shape.
- Sanitization must be independent of whether auth is configured.

## Drift Watch

- Do not sanitize intentional 4xx protocol/auth guidance.
- Do not introduce a new public error hierarchy for this one response.
- Do not bundle quarantine graduation into this cycle.

## Playback

1. Does an internal `processSyncRequest` failure return a stable generic
   response to clients?
   Yes. The response is now `500` with `code: "E_SYNC_INTERNAL"` and
   `error: "Sync failed"`.
2. Is the original error still observable through `LoggerPort`?
   Yes. `HttpSyncServer` logs the original `Error` object through
   `logger.error`.
3. Are intentional 4xx protocol, auth, route, and request-size responses still
   specific and actionable?
   Yes. The sanitizer is only used in the unexpected graph sync failure path.
4. Does this slice avoid changing sync protocol success semantics?
   Yes. Successful sync responses still flow through the same JSON response
   path.
5. Does the release DAG open quarantine graduation after this node closes?
   Yes. `REL_quarantine-graduate-clean` is now the only open node.

## Implementation

- Added `internalSyncErrorResponse()` with stable `E_SYNC_INTERNAL` response
  shape.
- Added a top-level `logger` option to `HttpSyncServer`.
- Routed `SyncServerLauncher` host loggers into `HttpSyncServer`.
- Replaced thrown-message `500` bodies with sanitized responses while logging
  the internal `Error`.
- Updated API docs, CHANGELOG, BEARING, and the v17 blocker DAG.

## Validation

- RED focused run failed 2 tests:
  `HttpSyncServer.test.ts` leaked the thrown message and rejected top-level
  `logger`.
- GREEN focused run:
  `npx vitest run test/unit/domain/services/HttpSyncServer.test.ts --testNamePattern "500|LoggerPort"`
  passed 1 file and 2 selected tests.
- Broader focused sync run:
  `npx vitest run test/unit/domain/services/HttpSyncServer.test.ts test/unit/domain/services/HttpSyncServer.auth.test.ts test/unit/domain/services/HttpSyncServer.authorize.test.ts test/unit/domain/services/controllers/SyncController.test.ts test/unit/domain/services/SyncController.test.ts`
  passed 5 files and 168 tests.
- TypeScript and lint checks passed after implementation:
  - `npm run typecheck`
  - `npm run lint -- --quiet`
- Full gates:
  - `npm run lint`
  - `npm run lint:sludge`
  - `npm run typecheck`
  - `npm run typecheck:consumer`
  - `npm run test:local` passed 438 files and 6771 tests.
  - `npm run lint:md`
  - `npm run lint:md:code`
  - `npm audit --omit=dev --audit-level=high`
  - `git diff --check`

## Closeout

`HEX_sync-500-sanitization` is complete. The open blocker front is now
`REL_quarantine-graduate-clean`; full release validation remains blocked
behind quarantine graduation.
