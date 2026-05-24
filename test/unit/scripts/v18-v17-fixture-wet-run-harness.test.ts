import { mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { runV17GoldenGraphFixtureWetRun }
  from '../../../scripts/v18.0.0/migrations/graph-model/V17GoldenGraphFixtureWetRunHarness.ts';
import {
  GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_PASSED,
} from '../../../src/domain/migrations/GraphModelMigrationRuntimeReplayResult.ts';

const FIXTURE_MANIFEST_PATH = resolve('fixtures/v17/graph-model-golden/manifest.json');

describe('v18 v17 fixture wet-run harness', () => {
  it('restores the fixture and exercises the scratch migration path without finalization', async () => {
    const targetDirectory = await mkdtemp(join(tmpdir(), 'git-warp-v17-wet-run-'));

    const result = await runV17GoldenGraphFixtureWetRun({
      manifestPath: FIXTURE_MANIFEST_PATH,
      targetDirectory,
    });

    expect(result.restoreResult.repositoryPath).toBe(targetDirectory);
    expect(result.restoreResult.restoredRefs.map((ref) => ref.refName)).toEqual([
      'refs/warp/v17-golden-graph/writers/alice',
      'refs/warp/v17-golden-graph/writers/bob',
    ]);
    expect(result.commandResult.dryRunPlan.hasFatalErrors()).toBe(false);
    expect(result.commandResult.loweringResult.hasFatalErrors()).toBe(false);
    expect(result.commandResult.scratchWriteResult?.hasFatalErrors()).toBe(false);
    expect(result.commandResult.scratchWriteResult?.writtenPatches.length).toBe(4);
    expect(result.commandResult.finalizationResult).toBeNull();
    expect(result.runtimeReplayResult?.status).toBe(GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_PASSED);
    expect(result.runtimeReplayResult?.replayedOperationCount).toBe(4);
  });

  it('records the current public-read equivalence gap as explicit wet-run evidence', async () => {
    const targetDirectory = await mkdtemp(join(tmpdir(), 'git-warp-v17-wet-run-gap-'));

    const result = await runV17GoldenGraphFixtureWetRun({
      manifestPath: FIXTURE_MANIFEST_PATH,
      targetDirectory,
    });

    expect(result.commandResult.gateResult?.allowsPromotion()).toBe(false);
    expect(result.commandResult.gateResult?.proofResult.summary.legacyFactCount).toBe(6);
    expect(result.commandResult.gateResult?.proofResult.summary.migratedFactCount).toBe(3);
    expect(result.commandResult.gateResult?.proofResult.summary.mismatchCount).toBe(5);
  });

  it('rejects empty harness paths before restore work', async () => {
    const targetDirectory = await mkdtemp(join(tmpdir(), 'git-warp-v17-wet-run-invalid-'));

    await expect(runV17GoldenGraphFixtureWetRun({
      manifestPath: '',
      targetDirectory,
    })).rejects.toThrow(/manifestPath/);
    await expect(runV17GoldenGraphFixtureWetRun({
      manifestPath: FIXTURE_MANIFEST_PATH,
      targetDirectory: '',
    })).rejects.toThrow(/targetDirectory/);
  });
});
