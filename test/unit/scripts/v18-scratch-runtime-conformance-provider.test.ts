import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import { createGraphModelMigrationScratchRuntimeConformanceProvider }
  from '../../../scripts/v18.0.0/migrations/graph-model/GraphModelMigrationScratchRuntimeConformanceProvider.ts';
import { writeGraphModelMigrationScratchHistory }
  from '../../../scripts/v18.0.0/migrations/graph-model/GraphModelMigrationScratchWriter.ts';
import GraphModelMigrationBasis from '../../../src/domain/migrations/GraphModelMigrationBasis.ts';
import GraphModelMigrationLoweredOperation
  from '../../../src/domain/migrations/GraphModelMigrationLoweredOperation.ts';
import GraphModelMigrationLoweredPatchPlan
  from '../../../src/domain/migrations/GraphModelMigrationLoweredPatchPlan.ts';
import GraphModelMigrationScratchWriteResult
  from '../../../src/domain/migrations/GraphModelMigrationScratchWriteResult.ts';
import {
  GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_FAILED,
  GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_PASSED,
} from '../../../src/domain/migrations/GraphModelMigrationRuntimeConformanceResult.ts';
import { gitOk } from './migrationTestEnvironment.ts';

const execFileAsync = promisify(execFile);
const SCRATCH_REF = 'refs/warp-migration-scratch/v17-golden-graph/migration';

describe('v18 scratch runtime conformance provider', () => {
  it('passes when scratch history reads back at the expected head', async () => {
    const repositoryPath = await initializedRepository('git-warp-v18-runtime-conformance-pass-');
    const writeResult = await writeGraphModelMigrationScratchHistory({
      repositoryPath,
      scratchRefName: SCRATCH_REF,
      patchPlan: patchPlan([operation('node-record', 'node:a', 'node:a')]),
    });
    const provider = createGraphModelMigrationScratchRuntimeConformanceProvider({
      repositoryPath,
    });

    const result = await provider(writeResult);

    expect(result?.status).toBe(GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_PASSED);
    expect(result?.allowsFinalization()).toBe(true);
    expect(result?.scratchHead).toBe(writeResult.scratchHead);
    expect(result?.witness).toBe('git-warp-v18-scratch-operation-readback-v1 facts=1');
  });

  it('fails closed when the scratch ref is no longer readable', async () => {
    const repositoryPath = await initializedRepository('git-warp-v18-runtime-conformance-missing-');
    const writeResult = await writeGraphModelMigrationScratchHistory({
      repositoryPath,
      scratchRefName: SCRATCH_REF,
      patchPlan: patchPlan([operation('node-record', 'node:a', 'node:a')]),
    });
    await gitOk(repositoryPath, ['update-ref', '-d', SCRATCH_REF], null);
    const provider = createGraphModelMigrationScratchRuntimeConformanceProvider({
      repositoryPath,
    });

    const result = await provider(writeResult);

    expect(result?.status).toBe(GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_FAILED);
    expect(result?.allowsFinalization()).toBe(false);
    expect(result?.fatalErrors.map((notice) => notice.code)).toEqual([
      'E_RUNTIME_CONFORMANCE_SCRATCH_REF_UNREADABLE',
    ]);
  });

  it('fails closed when scratch operation payloads cannot be read back', async () => {
    const repositoryPath = await initializedRepository('git-warp-v18-runtime-conformance-corrupt-');
    const writeResult = await writeGraphModelMigrationScratchHistory({
      repositoryPath,
      scratchRefName: SCRATCH_REF,
      patchPlan: patchPlan([operation('node-record', 'node:a', 'node:a')]),
    });
    const badHead = await writeBadScratchCommit(repositoryPath);
    await gitOk(repositoryPath, ['update-ref', SCRATCH_REF, badHead], null);
    const provider = createGraphModelMigrationScratchRuntimeConformanceProvider({
      repositoryPath,
    });

    const result = await provider(new GraphModelMigrationScratchWriteResult({
      scratchRef: writeResult.scratchRef,
      scratchHead: badHead,
      writtenPatches: writeResult.writtenPatches,
      warnings: [],
      fatalErrors: [],
    }));

    expect(result?.status).toBe(GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_FAILED);
    expect(result?.allowsFinalization()).toBe(false);
    expect(result?.fatalErrors.map((notice) => notice.code)).toEqual([
      'E_RUNTIME_CONFORMANCE_SCRATCH_HISTORY_UNREADABLE',
    ]);
  });
});

async function initializedRepository(prefix: string): Promise<string> {
  const repositoryPath = await mkdtemp(join(tmpdir(), prefix));
  await execFileAsync('git', ['init', '-q'], { cwd: repositoryPath });
  return repositoryPath;
}

function patchPlan(
  operations: readonly GraphModelMigrationLoweredOperation[],
): GraphModelMigrationLoweredPatchPlan {
  return new GraphModelMigrationLoweredPatchPlan({
    sourceBasis: new GraphModelMigrationBasis({
      graphId: 'v17-golden-graph',
      basisId: 'basis:source',
    }),
    targetBasis: new GraphModelMigrationBasis({
      graphId: 'v17-golden-graph',
      basisId: 'basis:scratch',
    }),
    operations,
  });
}

function operation(
  kind: 'node-record',
  sourceKey: string,
  targetKey: string,
): GraphModelMigrationLoweredOperation {
  return new GraphModelMigrationLoweredOperation({ kind, sourceKey, targetKey });
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
