# 0133 Sync Controller Reading Basis

- Status: `Final`
- Date: 2026-05-05
- Release lane: `v17.0.0`
- Source task: `PORT_sync-controller-reading-basis`
- DAG source: [0124-v17-release-blocker-dag.md](0124-v17-release-blocker-dag.md)

## Hill

`SyncController` no longer calls `_materializeGraph()` to create a
cached state before applying sync responses. Default sync without a
cached basis completes as metadata-only sync acceptance and does not
publish a state. `syncWith(..., { materialize: true })` remains the
explicit opt-in path that may create a reading basis before apply and
return the resulting state.

## User Stories

- As a release reviewer, I can inspect the sync host contract and see no
  dependency on `_materializeGraph()`.
- As an app developer, `status()`, `getFrontier()`, and sync request
  construction work without cached state or hidden replay.
- As an app developer, default `syncWith()` does not silently
  materialize when no reading basis exists; it returns sync metadata
  without publishing a state field.
- As a maintainer, the explicit `materialize: true` option is honest:
  it names the expensive basis creation instead of hiding it inside
  default sync.

## Requirements

- Remove `_materializeGraph()` from `SyncHost`.
- Keep frontier/status/request operations materialization-free.
- Keep `applySyncResponse()` requiring an existing cached reading basis.
- Make default `syncWith()` with missing cached state return applied
  count/skipped-writer metadata with no state publication and no
  materialization call.
- Make `syncWith(..., { materialize: true })` call the explicit
  `materialize()` substrate before apply when no cached state exists.
- Preserve direct peer, HTTP, retry, trust, skipped-writer, and
  `onStatus` behavior.
- Do not bundle sync auth defaults, rate limiting, or 500 sanitization.

## Acceptance Criteria

- RED sync-controller tests fail before production changes.
- `SyncController.ts` and `SyncControllerTypes.ts` no longer reference
  `_materializeGraph`.
- Focused sync controller suites pass.
- `CHANGELOG.md` records the sync reading-basis seam fix.
- DAG status marks `PORT_sync-controller-reading-basis` complete,
  unlocks `SPEC_materialize-spy-test-clusters`, and regenerates the SVG.

## Test Plan

### RED

- Default `syncWith()` with no cached state and a `_materializeGraph`
  trap returns sync metadata, omits `state`, and does not call the trap.
- `syncWith(..., { materialize: true })` calls `host.materialize()` when
  no cached state exists, applies the response, and returns the state.
- `applySyncResponse()` missing-state tests expect `E_NO_STATE` rather
  than stale "No materialized state" wording.
- Status/frontier paths remain quiet when `_materializeGraph` is trapped.

### Goldens

- Existing clean cached state sync still applies patches and updates
  `_lastFrontier`, `_patchesSinceGC`, skipped writers, and writers
  applied.
- Direct peer retry semantics remain unchanged.
- HTTP sync response and error behavior remain unchanged.
- `materialize: true` returns the post-apply cached state.

### Known Fails Outside This Cycle

- `SPEC_materialize-spy-test-clusters` owns remaining stale
  auto-materialize and materialization-spy suites after this seam.
- `SPEC_observer-coordinate-pinning` remains separate.
- Sync security hardening remains in `HEX_sync-*` nodes.
- Retired checkpoint schema fixture drift remains assigned elsewhere.

### Stress / Jitter

- Missing cached state with `materialize` omitted, false, and true.
- Direct peer and HTTP targets.
- Retryable and non-retryable sync errors.
- Trust gate pass/fail with and without patch writers.
- `onStatus` emission order around explicit materialization.

## RED Evidence

The first REDs installed a throwing `_materializeGraph` trap on sync
controller hosts and exercised default no-cache `syncWith()` plus
explicit `syncWith(..., { materialize: true })`.

Focused RED command:

```sh
npx vitest run test/unit/domain/services/controllers/SyncController.test.ts \
  test/unit/domain/services/SyncController.test.ts \
  -t "does not call _materializeGraph when no cached state exists|calls host.materialize"
```

Initial result: both suites failed because the old `syncWith()` path
called the private `_materializeGraph()` host method before apply.

The first GREEN attempt failed closed with `E_NO_STATE` when no cached
state existed. Broader witness tests then showed the public default sync
contract expected no hidden state publication, not a hard failure:

```sh
npx vitest run test/unit/domain/WarpGraph.syncMaterialize.test.ts \
  test/unit/domain/WarpApp.facade.test.ts \
  test/unit/domain/WarpGraph.noCoordination.test.ts \
  -t "syncWith\\(peer\\)|unwraps another WarpApp|survives random sync"
```

That drift forced the final behavior: default no-cache sync accepts the
response as metadata only, while explicit `materialize: true` creates the
reading basis and returns state.

## GREEN Changes

- `SyncHost` no longer exposes `_materializeGraph()`.
- `SyncHost` exposes an explicit `materialize()` operation for the
  opt-in `materialize: true` path.
- `applySyncResponse()` remains a reading-basis operation and returns
  `E_NO_STATE` when called without cached state.
- Default no-cache `syncWith()` validates the response, applies trust
  gates, reports `applied` and skipped writers, and does not publish a
  `state` field.
- Explicit `syncWith(..., { materialize: true })` calls
  `host.materialize()`, emits `materialized`, applies the response, and
  returns the cached state.

## Validation

- `npx vitest run test/unit/domain/services/controllers/SyncController.test.ts`
  passed: 72 tests.
- `npx vitest run test/unit/domain/services/SyncController.test.ts`
  passed: 41 tests.
- `npx vitest run test/unit/domain/WarpGraph.syncMaterialize.test.ts
  test/unit/domain/WarpApp.facade.test.ts
  test/unit/domain/WarpGraph.noCoordination.test.ts -t
  "syncWith\\(peer\\)|unwraps another WarpApp|survives random sync"`
  passed: 3 selected tests.
- `npm run lint` passed.
- `npm run lint:sludge` passed.
- `npm run typecheck` passed.
- `npm run typecheck:consumer` passed.
- `npm run lint:md` passed.
- `npm run lint:md:code` passed.
- `npm audit --omit=dev --audit-level=high` passed with 0
  vulnerabilities.
- `git diff --check` passed.
- `npm run test:local` remains red outside this cycle: 15 failed files,
  62 failed tests, and 6,727 passing tests. The remaining failures map
  to `SPEC_materialize-spy-test-clusters`,
  `SPEC_observer-coordinate-pinning`, and old checkpoint/materialize
  expectation cleanup.

## Playback Answers

1. No. `SyncHost` no longer names `_materializeGraph()`.
2. Yes. Default no-cache `syncWith()` does not create a cached state and
   does not return `state`.
3. Yes. `materialize: true` is the explicit path that creates the basis,
   applies the response, and returns state.
4. Yes. Status, frontier, request creation, and response processing stay
   materialization-free.
5. Yes. The DAG marks `PORT_sync-controller-reading-basis` complete and
   opens `SPEC_materialize-spy-test-clusters`.

## Playback Questions

1. Does the sync host contract still name `_materializeGraph()`?
2. Does default `syncWith()` avoid hidden replay and state publication
   when no reading basis exists?
3. Does explicit `materialize: true` still provide the old opt-in
   state-return behavior?
4. Do status/frontier request paths stay materialization-free?
5. Does the DAG now open `SPEC_materialize-spy-test-clusters`?

## Non-Goals

- Do not implement sync server auth enforcement.
- Do not add rate limiting.
- Do not sanitize HTTP 500 response bodies in this slice.
- Do not rewrite RuntimeHost or the sync protocol.
