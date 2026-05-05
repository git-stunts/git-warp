# 0135 Observer Coordinate Pinning Retro

- Date: 2026-05-05
- Cycle: `0135-observer-coordinate-pinning`
- Source task: `SPEC_observer-coordinate-pinning`
- Result: Complete

## What Changed

Default `graph.observer()` now snapshots the caller's current fresh
reading basis. The observer exposes a string state hash and keeps reading
that coordinate after live graph truth advances. `observer.seek()` still
returns a new observer at the requested source without mutating the
original observer or the caller graph's existing basis.

## Playback

- Default observer: pinned snapshot, not live graph backing.
- Seek: new observer, original preserved.
- Caller graph: not mutated by detached seek materialization.
- Explicit coordinate observers: still green in the observer files.
- Full local suite: observer failures removed.

## Drift

The latest `test:local` run exposed that all remaining normal test
failures are checkpoint/materialize incremental expectation drift. The
DAG now has an explicit `SPEC_checkpoint-materialize-test-drift` node for
that work instead of hiding it under the full-gate node.

## Validation Snapshot

- RED: selected observer witnesses failed 2 files / 2 tests.
- GREEN: selected observer witnesses passed; full observer files passed
  2 files / 34 tests.
- Gates: lint, sludge lint, typecheck, consumer typecheck, Markdown
  lint, Markdown code lint, high-severity npm audit, and whitespace diff
  check passed.
- Full `npm run test:local`: 6 failed files, 14 failed tests, 6,743
  passing tests.

## Good

- Fixed a real read-handle bug with a narrow QueryController change.
- Removed `_materializeGraph()` from the QueryController host contract
  for default observer creation.
- Updated the DAG when a hidden blocker became visible.

## Bad

- The observer source name `live` is still doing double duty for
  "capture current live coordinate" and "follow live truth."
- Checkpoint/materialize tests still mix retired schema fixtures with
  current runtime expectations.
- The DAG had missed the checkpoint/materialize test-drift node until
  full local validation exposed it.

## Ideas

- Split observer source DTOs into clearer "live-now" versus
  "coordinate" concepts if the language keeps confusing callers.
- Make the next checkpoint/materialize cycle classify each remaining
  failure as stale test, production accounting bug, or migration-only
  fixture.
- Add release-doctor output that maps failing test files to DAG nodes.

## Next

The current open front is:

- `SPEC_checkpoint-materialize-test-drift`
- `HEX_sync-secret-plain-string`
