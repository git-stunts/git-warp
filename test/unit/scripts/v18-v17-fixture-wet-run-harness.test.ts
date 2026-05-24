import { copyFile, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { runV17GoldenGraphFixtureWetRun }
  from '../../../scripts/v18.0.0/migrations/graph-model/V17GoldenGraphFixtureWetRunHarness.ts';
import { formatV17GoldenGraphFixtureWetRunReport }
  from '../../../scripts/v18.0.0/migrations/graph-model/V17GoldenGraphFixtureWetRunReport.ts';
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

  it('formats deterministic wet-run operator evidence without temp paths', async () => {
    const firstTarget = await mkdtemp(join(tmpdir(), 'git-warp-v17-wet-run-report-a-'));
    const secondTarget = await mkdtemp(join(tmpdir(), 'git-warp-v17-wet-run-report-b-'));

    const first = formatV17GoldenGraphFixtureWetRunReport(await runV17GoldenGraphFixtureWetRun({
      manifestPath: FIXTURE_MANIFEST_PATH,
      targetDirectory: firstTarget,
    }));
    const second = formatV17GoldenGraphFixtureWetRunReport(await runV17GoldenGraphFixtureWetRun({
      manifestPath: FIXTURE_MANIFEST_PATH,
      targetDirectory: secondTarget,
    }));

    expect(first).toBe(second);
    expect(first).not.toContain(firstTarget);
    expect(first).toContain('git-warp v18 v17 fixture wet-run report');
    expect(first).toContain('fixtureId: v17-golden-graph-model-001');
    expect(first).toContain('command.equivalence: blocked');
    expect(first).toContain('command.mismatches: 5');
    expect(first).toContain('runtimeReplay: passed');
    expect(first).toContain('runtimeReplayOperations: 4');
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

  it('fails closed when a fixture property fact cannot be mapped', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'git-warp-v17-wet-run-bad-property-'));
    const manifestPath = await fixtureVariant(directory, (raw) => raw.replace(
      '"key": "node:alpha:title"',
      '"key": "title"',
    ));

    await expect(runV17GoldenGraphFixtureWetRun({
      manifestPath,
      targetDirectory: join(directory, 'target'),
    })).rejects.toThrow(/owner:property public key format/);
  });

  it('fails closed when a fixture edge fact lowers to an invalid scratch target', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'git-warp-v17-wet-run-bad-edge-'));
    const manifestPath = await fixtureVariant(directory, (raw) => raw.replace(
      '"key": "node:alpha->node:beta:relates"',
      '"key": "edge-without-target-shape"',
    ));

    await expect(runV17GoldenGraphFixtureWetRun({
      manifestPath,
      targetDirectory: join(directory, 'target'),
    })).rejects.toThrow(/from->to:label/);
  });
});

async function fixtureVariant(
  directory: string,
  rewrite: (raw: string) => string,
): Promise<string> {
  const manifestPath = join(directory, 'manifest.json');
  await copyFile(
    resolve('fixtures/v17/graph-model-golden/v17-golden-graph.bundle'),
    join(directory, 'v17-golden-graph.bundle'),
  );
  await writeFile(
    manifestPath,
    rewrite(await readFile(FIXTURE_MANIFEST_PATH, 'utf8')),
    'utf8',
  );
  return manifestPath;
}
