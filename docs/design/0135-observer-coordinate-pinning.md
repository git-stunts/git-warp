# 0135 Observer Coordinate Pinning

- Status: `Final`
- Date: 2026-05-05
- Release lane: `v17.0.0`
- Source task: `SPEC_observer-coordinate-pinning`
- DAG source: [0124-v17-release-blocker-dag.md](0124-v17-release-blocker-dag.md)

## Hill

`graph.observer()` returns a read handle pinned to the caller's current
fresh reading basis. Later live graph changes do not mutate that
observer. `observer.seek()` returns a new observer at the requested
source while preserving the original observer and caller graph basis.

## User Stories

- As an app developer, an observer I open over the current graph keeps
  reading the same causal coordinate after live truth advances.
- As an app developer, `observer.seek()` gives me a new read handle
  without mutating the observer I already hold.
- As a maintainer, default observer pinning does not call
  `_materializeGraph()` when a fresh cached reading basis already exists.
- As a release reviewer, observer state hashes are actual strings for
  pinned observer handles.

## Requirements

- Fix default `graph.observer(name, config)` to snapshot the current
  fresh cached reading basis instead of returning a live graph-backed
  observer.
- Preserve explicit `{ source: { kind: 'live' } }`, coordinate, and
  strand observer behavior.
- Preserve `observer.seek()` as a constructor for a new observer.
- Do not rewrite RuntimeHost or query language.
- Do not add source-text tests.

## Acceptance Criteria

- RED observer pinning tests fail before production changes.
- `graph.observer()` over a fresh basis returns an observer with a
  string `stateHash`.
- That observer keeps reading the old value after live truth advances.
- `observer.seek()` returns a different observer with a different
  `stateHash` when live truth advances.
- The caller graph basis remains unchanged by `observer.seek()`.

## Test Plan

### RED

```sh
npx vitest run test/unit/domain/WarpGraph.strands.test.ts \
  test/unit/domain/WarpGraph.observerBoundary.test.ts \
  -t "observer\\(\\) pins|observer.seek\\(\\) returns"
```

Initial result: 2 failed files, 2 failed tests. The default observer
returned a live-backed handle with `stateHash === null`, and that handle
read the later blue property instead of the pinned red property.

### Goldens

- Default observer created after `graph.materialize()` reads red after
  live truth advances to blue.
- `observer.seek()` returns a new live observer that sees blue while the
  original sees red.
- The caller graph still reads red after `observer.seek()` because seek
  materializes only the detached observer basis.
- Explicit coordinate observers still read the requested coordinate.

### Known Fails Outside This Cycle

- Checkpoint/materialize incremental expectations remain in
  `WarpGraph.autoCheckpoint`, `WarpGraph.patchCount`,
  `WarpGraph.patchesFor`, `WarpGraph.test`,
  `MaterializeController.test`, and
  `hydrateCheckpointIndex.regression.test`.
- Sync security hardening remains under the `HEX_sync-*` nodes.

### Stress / Jitter

- Default source, explicit live source, explicit coordinate source.
- Observer before and after live graph advancement.
- Observer seek without mutating the original observer.
- State-hash stability for pinned snapshots.

## GREEN Changes

- `QueryController.observer()` now resolves a snapshot for default
  observers instead of returning a live graph-backed observer.
- The current-basis snapshot path clones the fresh cached state and
  computes its state hash through the injected state hasher.
- `QueryController` no longer needs `_materializeGraph()` on its host
  contract for default observer creation.
- Explicit live, coordinate, and strand observer sources still resolve
  through the existing detached observer graph path.

## Validation

- Focused RED witnesses passed after the fix: 2 selected tests.
- Full observer files passed: 2 files, 34 tests.
- `npm run lint` passed.
- `npm run lint:sludge` passed.
- `npm run typecheck` passed.
- `npm run typecheck:consumer` passed.
- `npm run lint:md` passed.
- `npm run lint:md:code` passed.
- `npm audit --omit=dev --audit-level=high` passed with 0
  vulnerabilities.
- `git diff --check` passed.
- `npm run test:local` remains red outside this cycle: 6 failed files,
  14 failed tests, and 6,743 passing tests. Remaining failures are
  checkpoint/materialize incremental expectation drift.

## Playback Answers

1. Yes. Default `graph.observer()` now builds a pinned snapshot observer.
2. Yes. `observer.seek()` returns a new observer and leaves the original
   observer pinned.
3. Yes. The caller graph remains at its existing reading basis after
   `observer.seek()`.
4. Yes. Existing explicit coordinate coverage remains green in the full
   observer files.
5. Yes. `test:local` dropped the observer pinning failures.

## Playback Questions

1. Does default `graph.observer()` produce a pinned snapshot observer?
2. Does `observer.seek()` preserve the original observer?
3. Does the caller graph remain at its existing reading basis after
   `observer.seek()`?
4. Do explicit-source observer paths still work?
5. Did `test:local` drop the observer pinning failures?

## Non-Goals

- Do not solve checkpoint/materialize incremental failures.
- Do not remove `autoMaterialize`.
- Do not implement live-tail bounded query/checksum substrate work.
