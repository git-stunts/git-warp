# 0131 Checkpoint Schema Upgrade Path

- Status: `Final`
- Date: 2026-05-04
- Release lane: `v17.0.0`
- Source task: `SPEC_uniform-git-cas-upgrade-contract-drift`
- Related task: `BND_checkpoint-schema-contract-drift`
- DAG source: [0124-v17-release-blocker-dag.md](0124-v17-release-blocker-dag.md)

## Hill

Provide an explicit `npm run upgrade` path that upgrades retired
checkpoint envelopes into the current checkpoint envelope, while keeping
retired readers and version-specific conversion code out of shipped
runtime source.

## User Stories

- As an operator with an older graph, I can run `npm run upgrade --
  --graph <name>` before opening the graph with v17.
- As a runtime maintainer, I can inspect `src/` and see no
  `MigrationService`, `createV5`, `isV5CheckpointSchema`, or runtime
  retired-schema policy helper.
- As a release reviewer, I can see behavioral tests proving dry-run,
  successful upgrade, incomplete-payload failure, and already-current
  no-op behavior.
- As a package consumer, the published upgrade command uses the built
  `dist/` migration entrypoint.

## Requirements

- Delete the public/runtime `MigrationService` export.
- Keep retired schema constants/readers under
  `scripts/migrations/v17.0.0/`.
- Make shipped runtime reject non-current checkpoint schemas with upgrade
  guidance, not with a runtime migration API.
- Implement dry-run behavior that reads and validates without moving the
  checkpoint ref.
- Implement successful upgrade as read retired checkpoint, write current
  checkpoint, verify load, then update ref.
- Preserve index shards and provenance index data when present.
- Keep versioned source names out of touched checkpoint runtime modules.

## Acceptance Criteria

- `test/unit/scripts/checkpoint-schema-upgrade.test.ts` proves the
  upgrade behavior.
- `test/unit/scripts/visible-state-upgrade.test.ts` owns the retired
  visible-state projection helper under scripts.
- `npm run typecheck`, `npm run typecheck:consumer`, `npm run build`, and
  `npm run lint` pass.
- The package upgrade witness reflects the built migration command.
- The release DAG marks `SPEC_uniform-git-cas-upgrade-contract-drift`
  complete and regenerates the SVG.

## Test Plan

### RED

- A retired checkpoint with `state.cbor`, `frontier.cbor`, and index
  shards should fail the new upgrade test until an upgrader exists.
- A dry-run should fail until the upgrader can read retired checkpoint
  payloads without updating refs.
- An incomplete retired checkpoint should fail until the upgrader rejects
  safely without moving refs.
- An already-current checkpoint should fail until the upgrader can detect
  and leave it alone.

### Goldens

- Dry-run returns `would-upgrade` and leaves the checkpoint ref unchanged.
- Real upgrade returns `upgraded`, changes the checkpoint ref, and the
  new checkpoint loads through shipped runtime.
- Incomplete retired payloads throw `CheckpointSchemaUpgradeError` and
  leave the old ref in place.
- Already-current checkpoints return `already-current` with no ref move.

### Known Fails Outside This Cycle

- Runtime still contains broader historical version-suffixed symbols such
  as reducer and operation names. This cycle removes the checkpoint and
  migration runtime names touched by the upgrade path; a broader symbol
  purge should be separate because it spans public substrate helpers.
- `npm run test:local` remains red until the remaining release-blocker
  DAG nodes close. Current shape after this cycle: `71` failures across
  `19` files.

### Stress / Jitter

- Dry-run versus real upgrade.
- Missing checkpoint ref.
- Retired checkpoint with and without index shards.
- Missing required retired payload blobs.
- Already-current checkpoint no-op.

## Playback Questions

1. Does v17 now provide a concrete checkpoint upgrade path?
2. Are retired readers and conversion helpers outside `src/`?
3. Does shipped runtime reject retired checkpoint schemas rather than
   supporting them directly?
4. Does the upgrader move refs only after verification?
5. Is the release DAG updated to reflect the closed upgrade contract
   blocker?

## Playback Answers

1. Yes. `scripts/migrations/v17.0.0/migrate.ts` runs
   `upgradeCheckpointSchema()`.
2. Yes for the touched checkpoint/migration path. The retired checkpoint
   reader and visible-state projection helper live under
   `scripts/migrations/v17.0.0/`.
3. Yes. `loadCheckpoint()` accepts only `CURRENT_CHECKPOINT_SCHEMA` and
   points users to `npm run upgrade -- --graph <name>`.
4. Yes. The upgrader writes the new checkpoint, verifies it through
   `loadCheckpoint()`, and then updates the checkpoint ref.
5. Yes. `SPEC_uniform-git-cas-upgrade-contract-drift` is marked complete
   and the SVG was regenerated.

## Validation

- `npx vitest run test/unit/scripts/checkpoint-schema-upgrade.test.ts`
  passed: `4` tests.
- `npx vitest run test/unit/scripts/visible-state-upgrade.test.ts`
  passed: `25` tests.
- Focused checkpoint schema/controller/service tests passed: `163`
  tests across `8` files.
- `npx vitest run test/unit/scripts/uniform-git-cas-closeout.test.ts
  test/unit/scripts/v17-migration-script-hygiene.test.ts` passed: `9`
  tests.
- `npm run typecheck` passed.
- `npm run typecheck:consumer` passed.
- `npm run build` passed.
- `npm run lint` passed.
- `npm run test:local` failed with `71` failures across `19` files;
  failures map to remaining DAG nodes rather than the checkpoint upgrade
  path.
- `npm audit --omit=dev --audit-level=high` passed with `0`
  vulnerabilities.

## Non-Goals

- Do not support retired checkpoint schemas inside shipped runtime.
- Do not create a public package-root migration API.
- Do not rewrite RuntimeHost, storage adapters, or query execution.
- Do not rename every historical version-suffixed substrate symbol in the
  repo in this cycle.
