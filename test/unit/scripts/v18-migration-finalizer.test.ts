import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import {
  finalizeGraphModelMigration,
} from '../../../scripts/v18.0.0/migrations/graph-model/GraphModelMigrationFinalizer.ts';
import GenesisEquivalenceComparisonBasis
  from '../../../src/domain/migrations/GenesisEquivalenceComparisonBasis.ts';
import GenesisEquivalenceGate from '../../../src/domain/migrations/GenesisEquivalenceGate.ts';
import GraphModelMigrationBasis from '../../../src/domain/migrations/GraphModelMigrationBasis.ts';
import GraphModelMigrationFinalizationConfirmation, {
  V18_GRAPH_MODEL_FINALIZATION_CONFIRMATION,
} from '../../../src/domain/migrations/GraphModelMigrationFinalizationConfirmation.ts';
import GraphModelMigrationFinalizationRequest
  from '../../../src/domain/migrations/GraphModelMigrationFinalizationRequest.ts';
import GraphModelMigrationFinalizationSafety
  from '../../../src/domain/migrations/GraphModelMigrationFinalizationSafety.ts';
import GraphModelMigrationRuntimeConformanceResult, {
  GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_PASSED,
} from '../../../src/domain/migrations/GraphModelMigrationRuntimeConformanceResult.ts';
import GraphModelMigrationScratchRef
  from '../../../src/domain/migrations/GraphModelMigrationScratchRef.ts';
import {
  divergentPropertyFixture,
  nodeLifecycleFixture,
} from '../domain/migrations/GenesisEquivalenceFixtures.ts';

const execFileAsync = promisify(execFile);
const LIVE_REF = 'refs/warp/v17-golden-graph/writers/alice';
const ARCHIVE_REF = 'refs/warp-migration-archive/v17-golden-graph/writers/alice';
const SCRATCH_REF = 'refs/warp-migration-scratch/v17-golden-graph/migration';

describe('v18 migration finalizer', () => {
  it('archives the old live ref and advances the live ref with expected-head updates', async () => {
    const repository = await repositoryWithLiveAndScratchRefs();

    const result = await finalizeGraphModelMigration({
      repositoryPath: repository.path,
      safetyResult: passedSafetyResult(repository.liveHead, repository.scratchHead),
    });

    expect(result.finalized()).toBe(true);
    expect(result.previousLiveHead).toBe(repository.liveHead);
    expect(result.finalizedLiveHead).toBe(repository.scratchHead);
    expect(await gitText(repository.path, ['rev-parse', ARCHIVE_REF])).toBe(repository.liveHead);
    expect(await gitText(repository.path, ['rev-parse', LIVE_REF])).toBe(repository.scratchHead);
  });

  it('does not create an archive or update the live ref when safety blocks finalization', async () => {
    const repository = await repositoryWithLiveAndScratchRefs();

    const result = await finalizeGraphModelMigration({
      repositoryPath: repository.path,
      safetyResult: failedSafetyResult(repository.liveHead, repository.scratchHead),
    });

    expect(result.finalized()).toBe(false);
    expect(result.fatalErrors.map((notice) => notice.code)).toEqual(['E_EQUIVALENCE_GATE_NOT_PASSED']);
    expect(await refExists(repository.path, ARCHIVE_REF)).toBe(false);
    expect(await gitText(repository.path, ['rev-parse', LIVE_REF])).toBe(repository.liveHead);
  });

  it('rejects an existing archive ref before changing the live ref', async () => {
    const repository = await repositoryWithLiveAndScratchRefs();
    await execFileAsync('git', ['update-ref', ARCHIVE_REF, repository.liveHead], {
      cwd: repository.path,
    });

    const result = await finalizeGraphModelMigration({
      repositoryPath: repository.path,
      safetyResult: passedSafetyResult(repository.liveHead, repository.scratchHead),
    });

    expect(result.finalized()).toBe(false);
    expect(result.fatalErrors.map((notice) => notice.code)).toEqual(['E_ARCHIVE_REF_EXISTS']);
    expect(await gitText(repository.path, ['rev-parse', LIVE_REF])).toBe(repository.liveHead);
  });

  it('rejects live ref drift before creating the archive ref', async () => {
    const repository = await repositoryWithLiveAndScratchRefs();
    const driftHead = await writeEmptyCommit(repository.path, 'drift');
    await execFileAsync('git', ['update-ref', LIVE_REF, driftHead, repository.liveHead], {
      cwd: repository.path,
    });

    const result = await finalizeGraphModelMigration({
      repositoryPath: repository.path,
      safetyResult: passedSafetyResult(repository.liveHead, repository.scratchHead),
    });

    expect(result.finalized()).toBe(false);
    expect(result.fatalErrors.map((notice) => notice.code)).toEqual(['E_STALE_LIVE_REF_EXPECTATION']);
    expect(await refExists(repository.path, ARCHIVE_REF)).toBe(false);
    expect(await gitText(repository.path, ['rev-parse', LIVE_REF])).toBe(driftHead);
  });

  it('rejects blank approved finalization strings before Git ref updates', async () => {
    const repository = await repositoryWithLiveAndScratchRefs();

    await expect(finalizeGraphModelMigration({
      repositoryPath: repository.path,
      safetyResult: passedSafetyResult(' ', repository.scratchHead),
    })).rejects.toThrow(/expectedLiveHead/);

    expect(await refExists(repository.path, ARCHIVE_REF)).toBe(false);
    expect(await gitText(repository.path, ['rev-parse', LIVE_REF])).toBe(repository.liveHead);
  });
});

type FinalizerFixtureRepository = {
  readonly path: string;
  readonly liveHead: string;
  readonly scratchHead: string;
};

async function repositoryWithLiveAndScratchRefs(): Promise<FinalizerFixtureRepository> {
  const repositoryPath = await initializedRepository('git-warp-v18-finalizer-');
  const liveHead = await writeEmptyCommit(repositoryPath, 'live');
  const scratchHead = await writeEmptyCommit(repositoryPath, 'scratch');
  await execFileAsync('git', ['update-ref', LIVE_REF, liveHead], { cwd: repositoryPath });
  await execFileAsync('git', ['update-ref', SCRATCH_REF, scratchHead], { cwd: repositoryPath });
  return Object.freeze({
    path: repositoryPath,
    liveHead,
    scratchHead,
  });
}

async function initializedRepository(prefix: string): Promise<string> {
  const repositoryPath = await mkdtemp(join(tmpdir(), prefix));
  await execFileAsync('git', ['init', '-q'], { cwd: repositoryPath });
  await execFileAsync('git', ['config', 'user.name', 'git-warp test'], { cwd: repositoryPath });
  await execFileAsync('git', ['config', 'user.email', 'git-warp@example.invalid'], { cwd: repositoryPath });
  return repositoryPath;
}

async function writeEmptyCommit(repositoryPath: string, message: string): Promise<string> {
  await execFileAsync('git', ['commit', '--allow-empty', '-q', '-m', message], {
    cwd: repositoryPath,
  });
  return await gitText(repositoryPath, ['rev-parse', 'HEAD']);
}

function passedSafetyResult(liveHead: string, scratchHead: string) {
  return new GraphModelMigrationFinalizationSafety().evaluate(
    finalizationRequest(liveHead, scratchHead, passedGateResult()),
  );
}

function failedSafetyResult(liveHead: string, scratchHead: string) {
  return new GraphModelMigrationFinalizationSafety().evaluate(
    finalizationRequest(liveHead, scratchHead, failedGateResult()),
  );
}

function finalizationRequest(
  liveHead: string,
  scratchHead: string,
  gateResult: ReturnType<GenesisEquivalenceGate['evaluate']>,
): GraphModelMigrationFinalizationRequest {
  const scratchRef = new GraphModelMigrationScratchRef({ refName: SCRATCH_REF });
  return new GraphModelMigrationFinalizationRequest({
    liveRefName: LIVE_REF,
    expectedLiveHead: liveHead,
    observedLiveHead: liveHead,
    scratchRef,
    scratchHead,
    archiveRefName: ARCHIVE_REF,
    confirmation: new GraphModelMigrationFinalizationConfirmation({
      token: V18_GRAPH_MODEL_FINALIZATION_CONFIRMATION,
    }),
    gateResult,
    runtimeConformance: runtimeConformance(scratchRef, scratchHead),
  });
}

function passedGateResult(): ReturnType<GenesisEquivalenceGate['evaluate']> {
  const fixture = nodeLifecycleFixture();
  return new GenesisEquivalenceGate().evaluate(
    basis(),
    fixture.legacyReading,
    fixture.migratedReading,
  );
}

function failedGateResult(): ReturnType<GenesisEquivalenceGate['evaluate']> {
  const fixture = divergentPropertyFixture();
  return new GenesisEquivalenceGate().evaluate(
    basis(),
    fixture.legacyReading,
    fixture.migratedReading,
  );
}

function basis(): GenesisEquivalenceComparisonBasis {
  return new GenesisEquivalenceComparisonBasis({
    legacyBasis: new GraphModelMigrationBasis({
      graphId: 'graph:fixture',
      basisId: 'basis:legacy',
    }),
    migratedBasis: new GraphModelMigrationBasis({
      graphId: 'graph:fixture',
      basisId: 'basis:scratch',
    }),
  });
}

function runtimeConformance(
  scratchRef: GraphModelMigrationScratchRef,
  scratchHead: string,
): GraphModelMigrationRuntimeConformanceResult {
  return new GraphModelMigrationRuntimeConformanceResult({
    scratchRef,
    scratchHead,
    status: GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_PASSED,
    witness: 'unit-test-runtime-conformance',
    fatalErrors: [],
  });
}

async function refExists(repositoryPath: string, refName: string): Promise<boolean> {
  const result = await execFileAsync('git', ['for-each-ref', '--format=%(refname)', refName], {
    cwd: repositoryPath,
  });
  return result.stdout.trim().length > 0;
}

async function gitText(repositoryPath: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', args, { cwd: repositoryPath });
  return result.stdout.trim();
}
