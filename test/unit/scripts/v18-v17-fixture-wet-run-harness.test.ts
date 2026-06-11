import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildV17GoldenFixturePropertyMappings,
  checkV17GoldenGraphFixtureWetRunDrift,
  runV17GoldenGraphFixtureWetRun,
  V17_WET_RUN_DRIFT_CHECK_FAILED,
  V17_WET_RUN_DRIFT_CHECK_PASSED,
}
  from '../../../scripts/v18.0.0/migrations/graph-model/V17GoldenGraphFixtureWetRunHarness.ts';
import { formatV17GoldenGraphFixtureWetRunReport }
  from '../../../scripts/v18.0.0/migrations/graph-model/V17GoldenGraphFixtureWetRunReport.ts';
import {
  restoreV17GoldenGraphFixture,
} from '../../../scripts/v18.0.0/migrations/graph-model/V17GoldenGraphFixtureRestore.ts';
import {
  GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_PASSED,
} from '../../../src/domain/migrations/GraphModelMigrationRuntimeReplayResult.ts';
import V17GoldenGraphFixtureManifest, {
  V17GoldenContentFact,
  V17GoldenEdgeFact,
  V17GoldenMultiWriterFact,
  V17GoldenNodeFact,
  V17GoldenPropertyFact,
  V17GoldenRemovalFact,
  V17GoldenGraphFixtureWriterChain,
} from '../../../scripts/v18.0.0/migrations/graph-model/V17GoldenGraphFixtureManifest.ts';
import { gitOk, MigrationTestDirectories } from './migrationTestEnvironment.ts';

const FIXTURE_MANIFEST_PATH = resolve('fixtures/v17/graph-model-golden/manifest.json');
const temporaryDirectories = new MigrationTestDirectories();

describe('v18 v17 fixture wet-run harness', () => {
  afterEach(async () => {
    await temporaryDirectories.cleanup();
  });

  it('restores the fixture and exercises the scratch migration path without finalization', async () => {
    const targetDirectory = await temporaryDirectories.create('git-warp-v17-wet-run-');

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
    expect(result.commandResult.scratchWriteResult?.writtenPatches.length).toBe(6);
    expect(result.commandResult.finalizationResult).toBeNull();
    expect(result.runtimeReplayResult?.status).toBe(GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_PASSED);
    expect(result.runtimeReplayResult?.replayedOperationCount).toBe(6);
    expect(result.driftCheckResult.status).toBe(V17_WET_RUN_DRIFT_CHECK_PASSED);
    expect(result.driftCheckResult.checkedRefCount).toBe(2);
  });

  it('represents removed-node and multi-writer fixture coverage in migrated readings', async () => {
    const targetDirectory = await temporaryDirectories.create('git-warp-v17-wet-run-gap-');

    const result = await runV17GoldenGraphFixtureWetRun({
      manifestPath: FIXTURE_MANIFEST_PATH,
      targetDirectory,
    });

    expect(result.commandResult.gateResult?.allowsPromotion()).toBe(true);
    expect(result.commandResult.gateResult?.proofResult.summary.legacyFactCount).toBe(8);
    expect(result.commandResult.gateResult?.proofResult.summary.migratedFactCount).toBe(8);
    expect(result.commandResult.gateResult?.proofResult.summary.mismatchCount).toBe(0);
    expect(result.commandResult.gateResult?.fatalErrors).toEqual([]);
  });

  it('proves the canonical wet-run has zero public-read mismatches', async () => {
    const targetDirectory = await temporaryDirectories.create('git-warp-v17-wet-run-zero-');

    const result = await runV17GoldenGraphFixtureWetRun({
      manifestPath: FIXTURE_MANIFEST_PATH,
      targetDirectory,
    });
    const report = formatV17GoldenGraphFixtureWetRunReport(result);

    expect(result.commandResult.gateResult?.proofResult.summary.mismatchCount).toBe(0);
    expect(result.commandResult.gateResult?.divergenceReport).toBeNull();
    expect(report).toContain('command.mismatches: 0');
    expect(report.split('\n').filter((line) => line === 'mismatches:')).toEqual([]);
  });

  it('formats deterministic wet-run operator evidence without temp paths', async () => {
    const firstTarget = await temporaryDirectories.create('git-warp-v17-wet-run-report-a-');
    const secondTarget = await temporaryDirectories.create('git-warp-v17-wet-run-report-b-');

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
    expect(first).toContain('command.equivalence: passed');
    expect(first).toContain('command.mismatches: 0');
    expect(first).not.toContain('\nmismatches:\n');
    expect(first).not.toContain('- missing node node:removed visibility');
    expect(first).not.toContain('- missing property writers:alice+bob coverage');
    expect(first).toContain('runtimeReplay: passed');
    expect(first).toContain('runtimeReplayOperations: 6');
    expect(first).toContain('driftCheck: passed');
    expect(first).toContain('driftCheckedRefs: 2');
  });

  it('detects restored source ref drift before future finalization', async () => {
    const targetDirectory = await temporaryDirectories.create('git-warp-v17-wet-run-drift-');
    const restoreResult = await restoreV17GoldenGraphFixture({
      manifestPath: FIXTURE_MANIFEST_PATH,
      targetDirectory,
    });
    const bobHead = restoreResult.restoredRefs[1]?.head;
    if (bobHead === undefined) {
      throw new Error('fixture must restore bob ref');
    }
    await gitOk(restoreResult.repositoryPath, [
      'update-ref',
      'refs/warp/v17-golden-graph/writers/alice',
      bobHead,
    ]);

    const driftCheck = await checkV17GoldenGraphFixtureWetRunDrift({
      repositoryPath: restoreResult.repositoryPath,
      manifest: restoreResult.manifest,
    });

    expect(driftCheck.status).toBe(V17_WET_RUN_DRIFT_CHECK_FAILED);
    expect(driftCheck.fatalErrors.map((notice) => notice.code)).toEqual([
      'E_WET_RUN_SOURCE_REF_DRIFT',
    ]);
  });

  it('rejects empty harness paths before restore work', async () => {
    const targetDirectory = await temporaryDirectories.create('git-warp-v17-wet-run-invalid-');

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
    const directory = await temporaryDirectories.create('git-warp-v17-wet-run-bad-property-');
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
    const directory = await temporaryDirectories.create('git-warp-v17-wet-run-bad-edge-');
    const manifestPath = await fixtureVariant(directory, (raw) => raw.replace(
      '"key": "node:alpha->node:beta:relates"',
      '"key": "edge-without-target-shape"',
    ));

    await expect(runV17GoldenGraphFixtureWetRun({
      manifestPath,
      targetDirectory: join(directory, 'target'),
    })).rejects.toThrow(/from->to:label/);
  });

  it('uses declared edge facts instead of delimiter shape for fixture property owners', () => {
    const mappings = buildV17GoldenFixturePropertyMappings(new V17GoldenGraphFixtureManifest({
      fixtureId: 'delimiter-shaped-node-owner',
      graphId: 'v17-golden-graph',
      sourceVersion: '17.0.1',
      generator: 'unit fixture',
      bundlePath: 'fixture.bundle',
      writerChains: [writerChain()],
      visibleFacts: [
        new V17GoldenNodeFact({
          key: 'node:looks->like:edge',
          description: 'node owner that looks like an edge key',
        }),
        new V17GoldenEdgeFact({
          key: 'node:alpha->node:beta:relates',
          description: 'declared edge owner',
        }),
        new V17GoldenPropertyFact({
          key: 'node:looks->like:edge:title',
          description: 'node property using delimiter-shaped owner',
        }),
        new V17GoldenPropertyFact({
          key: 'node:alpha->node:beta:relates:weight',
          description: 'declared edge property',
        }),
        new V17GoldenContentFact({
          key: 'node:looks->like:edge:_content',
          description: 'content coverage',
        }),
        new V17GoldenRemovalFact({
          key: 'node:removed',
          description: 'removal coverage',
        }),
        new V17GoldenMultiWriterFact({
          key: 'writers:alice+bob',
          description: 'writer coverage',
        }),
      ],
    }));

    expect(targetOwnerFor(mappings, 'node:looks->like:edge')).toBe('node:looks->like:edge');
    expect(targetOwnerFor(mappings, 'node:alpha->node:beta:relates')).toBe(
      '\x01node:alpha\0node:beta\0relates',
    );
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

function writerChain(): V17GoldenGraphFixtureWriterChain {
  return new V17GoldenGraphFixtureWriterChain({
    writerId: 'alice',
    refName: 'refs/warp/v17-golden-graph/writers/alice',
    expectedHead: '0123456789abcdef0123456789abcdef01234567',
    patchCount: 1,
  });
}

function targetOwnerFor(
  mappings: ReturnType<typeof buildV17GoldenFixturePropertyMappings>,
  legacyOwnerId: string,
): string {
  const mapping = mappings.find((candidate) => candidate.legacyOwnerId === legacyOwnerId);
  if (mapping === undefined) {
    throw new Error(`missing mapping for ${legacyOwnerId}`);
  }
  return mapping.targetOwnerId;
}
