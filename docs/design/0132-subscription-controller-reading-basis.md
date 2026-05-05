# 0132 Subscription Controller Reading Basis

- Status: `Final`
- Date: 2026-05-05
- Release lane: `v17.0.0`
- Source task: `PORT_subscription-controller-reading-basis`
- DAG source: [0124-v17-release-blocker-dag.md](0124-v17-release-blocker-dag.md)

## Hill

`SubscriptionController` no longer refreshes watch polling by calling
`_materializeGraph()`. Subscriptions publish from an available reading
basis: clean incremental patch diffs can notify subscribers immediately,
while poll-detected external frontier changes fail closed with reading
basis guidance instead of manufacturing a full replay behind `watch()`.

## User Stories

- As a release reviewer, I can inspect `SubscriptionController` and see
  no dependency on `_materializeGraph()`.
- As an app developer, local patch commits over a clean reading basis
  still notify `subscribe()` and `watch()` handlers.
- As a maintainer, watch polling detects external frontier drift without
  pretending it can refresh a live reading basis for free.
- As a release operator, the stale materialize-spy watch tests become
  honest behavior tests for subscriptions over readings.

## Requirements

- Remove `_materializeGraph()` from `SubscriptionController`'s host
  contract.
- Preserve subscribe/watch registration, unsubscribe, replay, filtering,
  polling lifecycle, and error swallowing behavior.
- On poll frontier change, call `onError` with the v17 stale reading
  basis diagnostic rather than full-materializing.
- Preserve local patch notification when a clean cached reading basis and
  patch diff are available.
- Do not alter sync, observer coordinate pinning, query live-tail
  checksum work, or global stale materialize-spy clusters.

## Acceptance Criteria

- RED subscription-controller and watch tests fail before production
  changes.
- `SubscriptionController.ts` no longer references `_materializeGraph`.
- Focused controller and runtime watch/subscribe tests pass.
- `CHANGELOG.md` records the subscription reading-basis change.
- DAG status marks `PORT_subscription-controller-reading-basis`
  complete and removes it from downstream incomplete blockers.
- Graphviz SVG is regenerated from the DOT source.

## Test Plan

### RED

- `SubscriptionController.watch()` with a changed frontier must report
  `E_STALE_STATE` through `onError` and must not call a materialization
  trap.
- `SubscriptionController.watch()` with unchanged frontier must still
  poll and stay quiet.
- Runtime `watch()` polling with a changed frontier must not call public
  `materialize()`.
- A clean cached runtime state plus local patch commit must publish the
  subscription diff without an extra materialize call.

### Goldens

- Existing subscribe/watch validation, filtering, replay, and unsubscribe
  behavior remains unchanged.
- Polling continues after an error and still respects the in-flight lock.
- Local patch notification is driven by the patch diff and reading basis,
  not by replaying the whole graph.
- Stale external frontier polling is explicit: the app receives a reading
  basis error and can choose a fresh query/worldline/checkpoint read.

### Known Fails Outside This Cycle

- `PORT_sync-controller-reading-basis` still owns sync materialization
  paths.
- `SPEC_materialize-spy-test-clusters` still owns remaining stale
  auto-materialize and internal spy suites after subscription and sync
  seams settle.
- `SPEC_observer-coordinate-pinning` remains a separate red cluster.
- Sync security hardening remains separate from subscription freshness.

### Stress / Jitter

- Multiple subscribers with mixed matching watch filters.
- Poll interval overlap while a frontier check is still in flight.
- Rejected frontier checks and rejected stale-reading diagnostics.
- Unsubscribe before and after polling ticks.
- Clean cached basis, dirty cached basis, and missing cached basis.

## Playback Questions

1. Does `SubscriptionController` have any `_materializeGraph`
   dependency?
2. Do poll-detected frontier changes fail closed with reading-basis
   guidance?
3. Do local patch commits over a clean reading basis still notify
   subscribers?
4. Did this cycle preserve replay, filtering, unsubscribe, and error
   handling behavior?
5. Does the DAG unlock more of `SPEC_materialize-spy-test-clusters`
   without touching sync or observer blockers?

## Non-Goals

- Do not implement a live-tail bounded subscription substrate.
- Do not rewrite `RuntimeHost`.
- Do not change sync controller behavior.
- Do not delete the advanced materialization substrate in this slice.

## RED

The focused witnesses failed before the production change:

```sh
npx vitest run test/unit/domain/services/controllers/SubscriptionController.test.ts
npx vitest run test/unit/domain/WarpGraph.watch.test.ts test/unit/domain/WarpGraph.subscribe.test.ts
```

Observed failures:

- `SubscriptionController.watch()` still called a `_materializeGraph`
  trap when `hasFrontierChanged()` returned `true`.
- Runtime `watch()` polling with a changed frontier did not report
  `E_STALE_STATE`.
- A clean cached runtime state plus local patch commit did not notify the
  watch subscriber until another materialization happened.

## GREEN

- `SubscriptionController`'s host contract no longer includes
  `_materializeGraph()`.
- Watch polling still checks `hasFrontierChanged()`, but a changed
  frontier now becomes `QueryError` `E_STALE_STATE` with the v17
  reading-basis guidance.
- Runtime `_setMaterializedState()` now publishes subscriber diffs after
  clean incremental state updates, so local patch commits over a clean
  cached reading basis notify `subscribe()` and `watch()` handlers
  without another replay.
- Stale materialize-spy tests in the watch polling cluster were rewritten
  into behavior tests that assert no materialization call is made.

## Validation

Passed:

```sh
npx vitest run test/unit/domain/services/controllers/SubscriptionController.test.ts
npx vitest run test/unit/domain/WarpGraph.watch.test.ts test/unit/domain/WarpGraph.subscribe.test.ts
npm run lint
npm run lint:sludge
npm run typecheck
npm run typecheck:consumer
npm run lint:md
npm run lint:md:code
npm audit --omit=dev --audit-level=high
git diff --check
```

Still red and assigned elsewhere:

```sh
npm run test:local
```

Latest `test:local` shape after this cycle:

```text
Test Files  17 failed | 420 passed (437)
Tests       66 failed | 6721 passed (6787)
```

Failure clusters remain in sync controller reading-basis work, observer
coordinate pinning, stale auto-materialize/materialize-spy suites,
retired checkpoint-schema assumptions in older tests, and checkpoint
incremental/materialize expectations assigned to later DAG cleanup.

## Playback Answers

1. Yes. `SubscriptionController.ts` no longer references
   `_materializeGraph()`.
2. Yes. Poll-detected frontier changes call `onError` with
   `E_STALE_STATE` and the shared readings guidance.
3. Yes. Clean cached runtime state plus local patch commit now notifies
   subscribers through `_setMaterializedState()` without calling
   `materialize()`.
4. Yes. The focused controller suite still passes all validation,
   filtering, replay, unsubscribe, in-flight, and error-swallowing
   tests.
5. Partly. The DAG now removes subscription from
   `SPEC_materialize-spy-test-clusters`; sync remains the last controller
   parent for that node.
