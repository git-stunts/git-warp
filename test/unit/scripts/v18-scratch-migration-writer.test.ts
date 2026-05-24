import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import {
  writeGraphModelMigrationScratchHistory,
} from '../../../scripts/v18.0.0/migrations/graph-model/GraphModelMigrationScratchWriter.ts';
import GraphModelMigrationBasis from '../../../src/domain/migrations/GraphModelMigrationBasis.ts';
import GraphModelMigrationLoweredOperation
  from '../../../src/domain/migrations/GraphModelMigrationLoweredOperation.ts';
import GraphModelMigrationLoweredPatchPlan
  from '../../../src/domain/migrations/GraphModelMigrationLoweredPatchPlan.ts';

const execFileAsync = promisify(execFile);
const SCRATCH_REF = 'refs/warp-migration-scratch/v17-golden-graph/migration';
const LIVE_WRITER_REF = 'refs/warp/v17-golden-graph/writers/alice';

describe('v18 scratch migration writer', () => {
  it('writes lowered operations only to an explicit scratch ref', async () => {
    const repositoryPath = await initializedRepository('git-warp-v18-scratch-');

    const result = await writeGraphModelMigrationScratchHistory({
      repositoryPath,
      scratchRefName: SCRATCH_REF,
      patchPlan: patchPlan([
        loweredOperation('node-record', 'node:a', 'node:a'),
        loweredOperation('property', 'node:a\0title', 'property-target-key:length-prefixed-v1:6:node:a:5:title'),
        loweredOperation('content-attachment', 'node:a\0_content', 'content-attachment:node:a:_content'),
      ]),
    });

    expect(result.hasFatalErrors()).toBe(false);
    expect(result.scratchRef?.refName).toBe(SCRATCH_REF);
    expect(result.writtenPatches).toHaveLength(3);
    expect(await gitText(repositoryPath, ['rev-list', '--count', SCRATCH_REF])).toBe('3');
    expect(await refExists(repositoryPath, LIVE_WRITER_REF)).toBe(false);
    expect(await gitText(repositoryPath, ['show', `${result.scratchHead ?? ''}:migration-operation.txt`]))
      .toContain('git-warp-v18-migration-operation-v1');
  });

  it('fails before writing when no scratch target is provided', async () => {
    const repositoryPath = await initializedRepository('git-warp-v18-scratch-missing-');

    const result = await writeGraphModelMigrationScratchHistory({
      repositoryPath,
      scratchRefName: null,
      patchPlan: patchPlan([loweredOperation('node-record', 'node:a', 'node:a')]),
    });

    expect(result.hasFatalErrors()).toBe(true);
    expect(result.fatalErrors.map((notice) => notice.code)).toEqual(['E_MISSING_SCRATCH_REF']);
    expect(await listRefs(repositoryPath)).toEqual([]);
  });

  it('rejects live writer ref targets before touching Git refs', async () => {
    const repositoryPath = await initializedRepository('git-warp-v18-scratch-live-');

    const result = await writeGraphModelMigrationScratchHistory({
      repositoryPath,
      scratchRefName: LIVE_WRITER_REF,
      patchPlan: patchPlan([loweredOperation('node-record', 'node:a', 'node:a')]),
    });

    expect(result.hasFatalErrors()).toBe(true);
    expect(result.fatalErrors.map((notice) => notice.code)).toEqual(['E_LIVE_REF_TARGET']);
    expect(await listRefs(repositoryPath)).toEqual([]);
  });

  it('appends to an existing scratch ref with an expected-head update', async () => {
    const repositoryPath = await initializedRepository('git-warp-v18-scratch-append-');
    const first = await writeGraphModelMigrationScratchHistory({
      repositoryPath,
      scratchRefName: SCRATCH_REF,
      patchPlan: patchPlan([loweredOperation('node-record', 'node:a', 'node:a')]),
    });

    const second = await writeGraphModelMigrationScratchHistory({
      repositoryPath,
      scratchRefName: SCRATCH_REF,
      patchPlan: patchPlan([loweredOperation('node-record', 'node:b', 'node:b')]),
    });

    expect(first.scratchHead).not.toBeNull();
    expect(second.scratchHead).not.toBe(first.scratchHead);
    expect(await gitText(repositoryPath, ['rev-list', '--count', SCRATCH_REF])).toBe('2');
    expect(await gitText(repositoryPath, ['rev-parse', `${second.scratchHead ?? ''}^`]))
      .toBe(first.scratchHead);
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
      basisId: 'source-basis',
    }),
    targetBasis: new GraphModelMigrationBasis({
      graphId: 'v17-golden-graph',
      basisId: 'target-basis',
    }),
    operations,
  });
}

function loweredOperation(
  kind: 'node-record' | 'property' | 'content-attachment',
  sourceKey: string,
  targetKey: string,
): GraphModelMigrationLoweredOperation {
  return new GraphModelMigrationLoweredOperation({
    kind,
    sourceKey,
    targetKey,
  });
}

async function refExists(repositoryPath: string, refName: string): Promise<boolean> {
  const result = await execFileAsync('git', ['for-each-ref', '--format=%(refname)', refName], {
    cwd: repositoryPath,
  });
  return result.stdout.trim().length > 0;
}

async function listRefs(repositoryPath: string): Promise<readonly string[]> {
  const result = await execFileAsync('git', ['for-each-ref', '--format=%(refname)'], {
    cwd: repositoryPath,
  });
  return result.stdout.trim().split('\n').filter((line) => line.length > 0);
}

async function gitText(repositoryPath: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', args, { cwd: repositoryPath });
  return result.stdout.trim();
}
