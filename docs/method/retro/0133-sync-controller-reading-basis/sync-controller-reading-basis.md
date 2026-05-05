# 0133 Sync Controller Reading Basis Retro

- Date: 2026-05-05
- Cycle: `0133-sync-controller-reading-basis`
- Source task: `PORT_sync-controller-reading-basis`
- Result: Complete

## What Changed

`SyncController` no longer depends on `_materializeGraph()` through its
host contract. The controller now distinguishes three paths:

- `applySyncResponse()` is still a reading-basis operation and fails
  closed with `E_NO_STATE` when no cached state exists.
- Default no-cache `syncWith()` accepts validated sync metadata without
  publishing a state.
- `syncWith(..., { materialize: true })` explicitly creates a reading
  basis through `host.materialize()`, applies the response, and returns
  state.

## Playback

- Host contract: `_materializeGraph()` is gone from `SyncHost`.
- Default sync: no hidden replay, no implicit state publication.
- Explicit sync: `materialize: true` remains the named expensive path.
- Status/frontier/request paths: still no materialization dependency.
- DAG: `PORT_sync-controller-reading-basis` is complete and
  `SPEC_materialize-spy-test-clusters` is open.

## Drift

The first GREEN shape was too strict. Making no-cache default sync throw
`E_NO_STATE` cleaned up the controller seam but broke public sync
expectations in `WarpGraph.syncMaterialize`, `WarpApp.facade`, and the
random no-coordination sync witness. The final contract is narrower and
more honest: default sync can exchange and accept metadata without
pretending it produced a live reading.

## Validation Snapshot

- Focused sync-controller suites: green.
- Public sync witnesses for peer sync, app facade sync, and random
  no-coordination sync: green for selected regressions.
- Lint, sludge lint, typecheck, consumer typecheck, Markdown lint,
  Markdown code lint, high-severity npm audit, and whitespace diff check:
  green.
- Full `npm run test:local`: still red with 15 failed files, 62 failed
  tests, and 6,727 passing tests. The visible failures are the remaining
  materialize-spy/auto-materialize cluster, observer coordinate pinning,
  and old checkpoint/materialize expectations.

## Good

- Removed another private materialization host seam without touching
  RuntimeHost broadly.
- Preserved the explicit state-return behavior behind
  `materialize: true`.
- Let broader public witnesses correct a too-hard fail-closed shape
  before commit.

## Bad

- Two sync-controller test suites duplicate the same seam expectations.
- Default sync result typing still compresses metadata-only and
  state-return results into one option-bearing shape.
- Remaining materialize-spy tests still inspect private behavior rather
  than the public reading contract.

## Ideas

- Split `SyncWithResult` into named result classes or a discriminated
  result family so metadata-only sync and state-return sync cannot be
  confused by callers.
- Pull duplicated sync-controller test helpers into a named test concept
  once the source churn settles.
- Add release-doctor output that buckets metadata-only sync, explicit
  materialize sync, and forbidden hidden materialization separately.

## Next

The new open front is:

- `SPEC_materialize-spy-test-clusters`
- `SPEC_observer-coordinate-pinning`
- `HEX_sync-secret-plain-string`
