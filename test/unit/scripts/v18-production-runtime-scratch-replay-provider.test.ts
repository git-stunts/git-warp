import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import {
  createGraphModelMigrationProductionRuntimeConformanceProvider,
  verifyGraphModelMigrationProductionRuntimeReplay,
} from '../../../scripts/v18.0.0/migrations/graph-model/GraphModelMigrationProductionRuntimeReplayProvider.ts';
import { writeGraphModelMigrationScratchHistory }
  from '../../../scripts/v18.0.0/migrations/graph-model/GraphModelMigrationScratchWriter.ts';
import { runMigrationGit }
  from '../../../scripts/v18.0.0/migrations/graph-model/GitMigrationCommandRunner.ts';
import GraphModelMigrationBasis from '../../../src/domain/migrations/GraphModelMigrationBasis.ts';
import GraphModelMigrationLoweredOperation
  from '../../../src/domain/migrations/GraphModelMigrationLoweredOperation.ts';
import GraphModelMigrationLoweredPatchPlan
  from '../../../src/domain/migrations/GraphModelMigrationLoweredPatchPlan.ts';
import GraphModelMigrationRuntimeReplayRequest
  from '../../../src/domain/migrations/GraphModelMigrationRuntimeReplayRequest.ts';
import {
  GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_FAILED,
  GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_PASSED,
} from '../../../src/domain/migrations/GraphModelMigrationRuntimeReplayResult.ts';
import GraphModelMigrationScratchWriteResult
  from '../../../src/domain/migrations/GraphModelMigrationScratchWriteResult.ts';
import {
  GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_FAILED,
  GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_PASSED,
} from '../../../src/domain/migrations/GraphModelMigrationRuntimeConformanceResult.ts';

const execFileAsync = promisify(execFile);
const GRAPH_ID = 'v17-golden-graph';
const SCRATCH_REF = 'refs/warp-migration-scratch/v17-golden-graph/runtime-replay';

describe('v18 production runtime scratch replay provider', () => {
  it('passes when scratch operations replay through normal graph runtime', async () => {
    const repositoryPath = await initializedRepository('git-warp-v18-runtime-replay-pass-');
    const writeResult = await writeGraphModelMigrationScratchHistory({
      repositoryPath,
      scratchRefName: SCRATCH_REF,
      patchPlan: patchPlan([
        operation('node-record', 'node:alpha', 'node:alpha'),
        operation('node-record', 'node:beta', 'node:beta'),
        operation('edge-record', 'edge:alpha-beta', 'node:alpha->node:beta:relates'),
        operation('property', 'node:alpha:title', propertyTarget('node:alpha', 'title')),
        operation(
          'property',
          'node:alpha->node:beta:relates\0weight',
          propertyTarget(edgePropertyOwner('node:alpha', 'node:beta', 'relates'), 'weight'),
        ),
      ]),
    });

    const result = await verifyGraphModelMigrationProductionRuntimeReplay({
      sourceRepositoryPath: repositoryPath,
      request: replayRequest(writeResult),
    });

    expect(result.status).toBe(GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_PASSED);
    expect(result.allowsFinalization()).toBe(true);
    expect(result.replayedOperationCount).toBe(5);
    expect(result.witness).toBe('git-warp-v18-production-runtime-scratch-replay-v1 operations=5');
  });

  it('maps production-runtime replay into finalization conformance evidence', async () => {
    const repositoryPath = await initializedRepository('git-warp-v18-runtime-replay-conformance-');
    const writeResult = await writeGraphModelMigrationScratchHistory({
      repositoryPath,
      scratchRefName: SCRATCH_REF,
      patchPlan: patchPlan([operation('node-record', 'node:alpha', 'node:alpha')]),
    });
    const provider = createGraphModelMigrationProductionRuntimeConformanceProvider({
      sourceRepositoryPath: repositoryPath,
      graphId: GRAPH_ID,
    });

    const result = await provider(writeResult);

    expect(result?.status).toBe(GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_PASSED);
    expect(result?.allowsFinalization()).toBe(true);
    expect(result?.witness).toBe('git-warp-v18-production-runtime-scratch-replay-v1 operations=1');
  });

  it('fails closed when the scratch ref head has drifted', async () => {
    const repositoryPath = await initializedRepository('git-warp-v18-runtime-replay-drift-');
    const writeResult = await writeGraphModelMigrationScratchHistory({
      repositoryPath,
      scratchRefName: SCRATCH_REF,
      patchPlan: patchPlan([operation('node-record', 'node:alpha', 'node:alpha')]),
    });
    const replacementHead = await writeBadScratchCommit(repositoryPath);
    await gitOk(repositoryPath, ['update-ref', SCRATCH_REF, replacementHead], null);

    const result = await verifyGraphModelMigrationProductionRuntimeReplay({
      sourceRepositoryPath: repositoryPath,
      request: replayRequest(writeResult),
    });

    expect(result.status).toBe(GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_FAILED);
    expect(result.fatalErrors.map((notice) => notice.code)).toEqual([
      'E_RUNTIME_REPLAY_SCRATCH_HEAD_CHANGED',
    ]);
  });

  it('fails closed when a scratch operation target cannot be applied', async () => {
    const repositoryPath = await initializedRepository('git-warp-v18-runtime-replay-bad-target-');
    const writeResult = await writeGraphModelMigrationScratchHistory({
      repositoryPath,
      scratchRefName: SCRATCH_REF,
      patchPlan: patchPlan([operation('edge-record', 'edge:bad', 'not-an-edge-target')]),
    });
    const provider = createGraphModelMigrationProductionRuntimeConformanceProvider({
      sourceRepositoryPath: repositoryPath,
      graphId: GRAPH_ID,
    });

    const result = await provider(writeResult);

    expect(result?.status).toBe(GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_FAILED);
    expect(result?.fatalErrors.map((notice) => notice.code)).toEqual([
      'E_RUNTIME_REPLAY_INVALID_OPERATION_TARGET',
    ]);
  });
});

async function initializedRepository(prefix: string): Promise<string> {
  const repositoryPath = await mkdtemp(join(tmpdir(), prefix));
  await execFileAsync('git', ['init', '-q'], { cwd: repositoryPath });
  return repositoryPath;
}

function replayRequest(
  writeResult: GraphModelMigrationScratchWriteResult,
): GraphModelMigrationRuntimeReplayRequest {
  if (writeResult.scratchRef === null || writeResult.scratchHead === null) {
    throw new Error('scratch write result must contain output');
  }
  return new GraphModelMigrationRuntimeReplayRequest({
    graphId: GRAPH_ID,
    writerId: 'scratch-migration',
    scratchRef: writeResult.scratchRef,
    scratchHead: writeResult.scratchHead,
  });
}

function patchPlan(
  operations: readonly GraphModelMigrationLoweredOperation[],
): GraphModelMigrationLoweredPatchPlan {
  return new GraphModelMigrationLoweredPatchPlan({
    sourceBasis: new GraphModelMigrationBasis({
      graphId: GRAPH_ID,
      basisId: 'basis:source',
    }),
    targetBasis: new GraphModelMigrationBasis({
      graphId: GRAPH_ID,
      basisId: 'basis:scratch',
    }),
    operations,
  });
}

function operation(
  kind: 'node-record' | 'edge-record' | 'property',
  sourceKey: string,
  targetKey: string,
): GraphModelMigrationLoweredOperation {
  return new GraphModelMigrationLoweredOperation({ kind, sourceKey, targetKey });
}

function propertyTarget(ownerId: string, propertyKey: string): string {
  return [
    'property-target-key:length-prefixed-v1',
    ownerId.length,
    ownerId,
    propertyKey.length,
    propertyKey,
  ].join(':');
}

function edgePropertyOwner(from: string, to: string, label: string): string {
  return `\x01${from}\0${to}\0${label}`;
}

async function writeBadScratchCommit(repositoryPath: string): Promise<string> {
  const blobOid = await gitOk(repositoryPath, ['hash-object', '-w', '--stdin'], 'not a scratch payload\n');
  const treeOid = await gitOk(
    repositoryPath,
    ['mktree'],
    `100644 blob ${blobOid}\tmigration-operation.txt\n`,
  );
  return await gitOk(repositoryPath, ['commit-tree', treeOid], 'bad scratch payload\n');
}

async function gitOk(
  repositoryPath: string,
  args: readonly string[],
  input: string | null,
): Promise<string> {
  const result = await runMigrationGit(repositoryPath, args, input, { deterministicIdentity: true });
  expect(result.ok()).toBe(true);
  return result.stdout.trim();
}
