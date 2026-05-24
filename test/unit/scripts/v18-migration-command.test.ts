import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import {
  runGraphModelMigrationCommand,
} from '../../../scripts/v18.0.0/migrations/graph-model/GraphModelMigrationCommand.ts';
import { buildGraphModelMigrationScratchReading }
  from '../../../scripts/v18.0.0/migrations/graph-model/GraphModelMigrationScratchReadingBuilder.ts';
import DryRunGraphModelMigrationPlanRequest
  from '../../../src/domain/migrations/DryRunGraphModelMigrationPlanRequest.ts';
import GenesisEquivalenceBoundary
  from '../../../src/domain/migrations/GenesisEquivalenceBoundary.ts';
import GenesisEquivalenceComparisonBasis
  from '../../../src/domain/migrations/GenesisEquivalenceComparisonBasis.ts';
import GenesisEquivalenceReading
  from '../../../src/domain/migrations/GenesisEquivalenceReading.ts';
import GenesisEquivalenceReadingFact
  from '../../../src/domain/migrations/GenesisEquivalenceReadingFact.ts';
import GraphModelMigrationBasis from '../../../src/domain/migrations/GraphModelMigrationBasis.ts';
import GraphModelMigrationFinalizationConfirmation, {
  V18_GRAPH_MODEL_FINALIZATION_CONFIRMATION,
} from '../../../src/domain/migrations/GraphModelMigrationFinalizationConfirmation.ts';
import GraphModelMigrationNodeMapping
  from '../../../src/domain/migrations/GraphModelMigrationNodeMapping.ts';
import GraphModelMigrationPatchDescriptor
  from '../../../src/domain/migrations/GraphModelMigrationPatchDescriptor.ts';
import GraphModelMigrationRuntimeConformanceResult, {
  GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_PASSED,
} from '../../../src/domain/migrations/GraphModelMigrationRuntimeConformanceResult.ts';
import type GraphModelMigrationScratchWriteResult
  from '../../../src/domain/migrations/GraphModelMigrationScratchWriteResult.ts';
import GraphModelMigrationSourceInventory
  from '../../../src/domain/migrations/GraphModelMigrationSourceInventory.ts';
import GraphModelMigrationWriterChainDescriptor
  from '../../../src/domain/migrations/GraphModelMigrationWriterChainDescriptor.ts';
import {
  divergentPropertyFixture,
  nodeLifecycleFixture,
} from '../domain/migrations/GenesisEquivalenceFixtures.ts';

const execFileAsync = promisify(execFile);
const LIVE_REF = 'refs/warp/v17-golden-graph/writers/alice';
const ARCHIVE_REF = 'refs/warp-migration-archive/v17-golden-graph/writers/alice';
const SCRATCH_REF = 'refs/warp-migration-scratch/v17-golden-graph/migration';

describe('v18 graph-model migration command', () => {
  it('runs planning, lowering, scratch writing, and equivalence without finalizing by default', async () => {
    const repository = await initializedRepository('git-warp-v18-command-dry-');
    const fixture = nodeLifecycleFixture();

    const result = await runGraphModelMigrationCommand({
      repositoryPath: repository,
      dryRunRequest: dryRunRequest(),
      scratchRefName: SCRATCH_REF,
      equivalenceBasis: basis(),
      legacyReading: fixture.legacyReading,
      scratchReading: fixture.migratedReading,
      readingProviders: null,
      finalization: null,
    });

    expect(result.dryRunPlan.hasFatalErrors()).toBe(false);
    expect(result.loweringResult.hasFatalErrors()).toBe(false);
    expect(result.scratchWriteResult?.hasFatalErrors()).toBe(false);
    expect(result.gateResult?.allowsPromotion()).toBe(true);
    expect(result.finalizationResult).toBeNull();
    expect(await gitText(repository, ['rev-list', '--count', SCRATCH_REF])).toBe('1');
    expect(await refExists(repository, ARCHIVE_REF)).toBe(false);
  });

  it('finalizes when explicit finalization options and the equivalence gate pass', async () => {
    const repository = await repositoryWithLiveRef();
    const fixture = nodeLifecycleFixture();

    const result = await runGraphModelMigrationCommand({
      repositoryPath: repository.path,
      dryRunRequest: dryRunRequest(),
      scratchRefName: SCRATCH_REF,
      equivalenceBasis: basis(),
      legacyReading: fixture.legacyReading,
      scratchReading: fixture.migratedReading,
      readingProviders: null,
      finalization: {
        liveRefName: LIVE_REF,
        expectedLiveHead: repository.liveHead,
        archiveRefName: ARCHIVE_REF,
        confirmation: confirmation(),
        runtimeConformance: runtimeConformance,
      },
    });

    expect(result.gateResult?.allowsPromotion()).toBe(true);
    expect(result.finalizationResult?.finalized()).toBe(true);
    expect(await gitText(repository.path, ['rev-parse', ARCHIVE_REF])).toBe(repository.liveHead);
    expect(await gitText(repository.path, ['rev-parse', LIVE_REF]))
      .toBe(result.scratchWriteResult?.scratchHead);
  });

  it('blocks finalization when supplied scratch readings diverge', async () => {
    const repository = await repositoryWithLiveRef();
    const fixture = divergentPropertyFixture();

    const result = await runGraphModelMigrationCommand({
      repositoryPath: repository.path,
      dryRunRequest: dryRunRequest(),
      scratchRefName: SCRATCH_REF,
      equivalenceBasis: basis(),
      legacyReading: fixture.legacyReading,
      scratchReading: fixture.migratedReading,
      readingProviders: null,
      finalization: {
        liveRefName: LIVE_REF,
        expectedLiveHead: repository.liveHead,
        archiveRefName: ARCHIVE_REF,
        confirmation: confirmation(),
        runtimeConformance: runtimeConformance,
      },
    });

    expect(result.gateResult?.allowsPromotion()).toBe(false);
    expect(result.finalizationResult?.finalized()).toBe(false);
    expect(result.finalizationResult?.fatalErrors.map((notice) => notice.code)).toEqual([
      'E_EQUIVALENCE_GATE_NOT_PASSED',
    ]);
    expect(await refExists(repository.path, ARCHIVE_REF)).toBe(false);
    expect(await gitText(repository.path, ['rev-parse', LIVE_REF])).toBe(repository.liveHead);
  });

  it('can construct readings through command-owned providers after scratch writing', async () => {
    const repository = await initializedRepository('git-warp-v18-command-providers-');

    const result = await runGraphModelMigrationCommand({
      repositoryPath: repository,
      dryRunRequest: dryRunRequest(),
      scratchRefName: SCRATCH_REF,
      equivalenceBasis: basis(),
      legacyReading: null,
      scratchReading: null,
      readingProviders: {
        legacyReading: async () => legacyNodeReading(),
        scratchReading: async () => await buildGraphModelMigrationScratchReading({
          repositoryPath: repository,
          scratchRefName: SCRATCH_REF,
          readingId: 'scratch:provider',
        }),
      },
      finalization: null,
    });

    expect(result.gateResult?.allowsPromotion()).toBe(true);
    expect(result.gateResult?.proofResult.summary.legacyFactCount).toBe(1);
    expect(result.gateResult?.proofResult.summary.migratedFactCount).toBe(1);
  });
});

type CommandFixtureRepository = {
  readonly path: string;
  readonly liveHead: string;
};

async function repositoryWithLiveRef(): Promise<CommandFixtureRepository> {
  const repositoryPath = await initializedRepository('git-warp-v18-command-finalize-');
  const liveHead = await writeEmptyCommit(repositoryPath, 'live');
  await execFileAsync('git', ['update-ref', LIVE_REF, liveHead], { cwd: repositoryPath });
  return Object.freeze({ path: repositoryPath, liveHead });
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

function dryRunRequest(): DryRunGraphModelMigrationPlanRequest {
  return new DryRunGraphModelMigrationPlanRequest({
    inventory: sourceInventory(),
    requiredContentKeys: [],
    nodeMappings: [
      new GraphModelMigrationNodeMapping({
        legacyNodeId: 'node:article',
        targetNodeId: 'node:article',
      }),
    ],
    edgeMappings: [],
    propertyMappings: [],
  });
}

function legacyNodeReading(): GenesisEquivalenceReading {
  return new GenesisEquivalenceReading({
    readingId: 'legacy:provider',
    facts: [
      new GenesisEquivalenceReadingFact({
        kind: 'node',
        factKey: 'node:article',
        fieldPath: 'visibility',
        value: 'visible',
        boundary: new GenesisEquivalenceBoundary({
          writerId: 'alice',
          patchId: 'patch:alice:0',
          operationIndex: 0,
        }),
      }),
    ],
  });
}

function sourceInventory(): GraphModelMigrationSourceInventory {
  return new GraphModelMigrationSourceInventory({
    graphId: 'v17-golden-graph',
    sourceBasis: new GraphModelMigrationBasis({
      graphId: 'v17-golden-graph',
      basisId: 'basis:source',
    }),
    writerChains: [
      new GraphModelMigrationWriterChainDescriptor({
        writerId: 'alice',
        patchIds: ['patch:alice:0'],
      }),
    ],
    patchDescriptors: [
      new GraphModelMigrationPatchDescriptor({
        patchId: 'patch:alice:0',
        writerId: 'alice',
        writerSequence: 0,
      }),
    ],
    stateSnapshot: null,
    contentSources: [],
    warnings: [],
    fatalErrors: [],
  });
}

function basis(): GenesisEquivalenceComparisonBasis {
  return new GenesisEquivalenceComparisonBasis({
    legacyBasis: new GraphModelMigrationBasis({
      graphId: 'v17-golden-graph',
      basisId: 'basis:source',
    }),
    migratedBasis: new GraphModelMigrationBasis({
      graphId: 'v17-golden-graph',
      basisId: 'basis:scratch',
    }),
  });
}

function confirmation(): GraphModelMigrationFinalizationConfirmation {
  return new GraphModelMigrationFinalizationConfirmation({
    token: V18_GRAPH_MODEL_FINALIZATION_CONFIRMATION,
  });
}

function runtimeConformance(
  scratchWriteResult: GraphModelMigrationScratchWriteResult,
): GraphModelMigrationRuntimeConformanceResult | null {
  if (scratchWriteResult.scratchRef === null || scratchWriteResult.scratchHead === null) {
    return null;
  }
  return new GraphModelMigrationRuntimeConformanceResult({
    scratchRef: scratchWriteResult.scratchRef,
    scratchHead: scratchWriteResult.scratchHead,
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
