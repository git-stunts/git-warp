# 0134 Materialize Spy Test Clusters Retro

- Date: 2026-05-05
- Cycle: `0134-materialize-spy-test-clusters`
- Source task: `SPEC_materialize-spy-test-clusters`
- Result: Complete

## What Changed

The former auto-materialize and materialization-spy tests now describe
the v17 read contract. Direct cached-state reads fail without a fresh
reading basis, explicit internal materialization can create a substrate
basis for unit tests, and `patchMany()` does not promise callback-time
read visibility unless a basis is opened separately.

## Playback

- Private call counts: removed from the rewritten cluster.
- Hidden auto-materialization: replaced with `E_NO_STATE` and
  `E_STALE_STATE` expectations.
- Explicit basis: still covered for direct reads and remove operations.
- Focused cluster: green, 7 files and 113 tests.
- Full local suite: reduced to 8 failed files and 16 failed tests.

## Drift

`autoMaterialize` still exists as accepted configuration vocabulary.
This cycle deliberately did not remove that surface because the task was
test-gate hygiene, but the tests now make clear that it no longer grants
implicit read-basis creation.

## Validation Snapshot

- RED: focused cluster failed 7 files / 46 tests.
- GREEN: focused cluster passed 7 files / 113 tests.
- Gates: lint, sludge lint, typecheck, consumer typecheck, Markdown
  lint, Markdown code lint, high-severity npm audit, and whitespace diff
  check passed.
- Full `npm run test:local`: 8 failed files, 16 failed tests, 6,741
  passing tests.

## Good

- Removed a large stale test cluster without changing production code.
- Replaced private cache/call-count tests with observable behavior.
- Cut the local release gate from 62 failures to 16.

## Bad

- `autoMaterialize` still exists in configuration names and docs.
- Several old checkpoint/materialize tests still encode retired schema
  and incremental materialization assumptions.
- Observer coordinate pinning remains a real behavioral failure.

## Ideas

- Add a small follow-up DAG node to retire `autoMaterialize` from public
  type/docs once the remaining read contract gates are green.
- Split checkpoint/materialize incremental failures into a dedicated
  schema-current test cleanup cycle.
- Add a release-doctor bucket that reports stale tests by contract area,
  not just raw failure files.

## Next

The current open front is:

- `SPEC_observer-coordinate-pinning`
- `HEX_sync-secret-plain-string`
