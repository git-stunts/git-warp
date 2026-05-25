import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import { buildGraphModelMigrationScratchReading }
  from '../../../scripts/v18.0.0/migrations/graph-model/GraphModelMigrationScratchReadingBuilder.ts';
import { writeGraphModelMigrationScratchHistory }
  from '../../../scripts/v18.0.0/migrations/graph-model/GraphModelMigrationScratchWriter.ts';
import GraphModelMigrationBasis from '../../../src/domain/migrations/GraphModelMigrationBasis.ts';
import GraphModelMigrationLoweredOperation
  from '../../../src/domain/migrations/GraphModelMigrationLoweredOperation.ts';
import GraphModelMigrationLoweredPatchPlan
  from '../../../src/domain/migrations/GraphModelMigrationLoweredPatchPlan.ts';
import { gitOk } from './migrationTestEnvironment.ts';

const execFileAsync = promisify(execFile);
const SCRATCH_REF = 'refs/warp-migration-scratch/v17-golden-graph/migration';

describe('v18 scratch reading builder', () => {
  it('builds genesis equivalence facts from scratch operation commits', async () => {
    const repositoryPath = await initializedRepository();
    await writeGraphModelMigrationScratchHistory({
      repositoryPath,
      scratchRefName: SCRATCH_REF,
      patchPlan: patchPlan([
        operation('node-record', 'node:a', 'node:a'),
        operation('property', 'node:a/title', 'property:node:a/title'),
      ]),
    });

    const reading = await buildGraphModelMigrationScratchReading({
      repositoryPath,
      scratchRefName: SCRATCH_REF,
      readingId: 'scratch:v18',
    });

    expect(reading.facts.map((fact) => fact.toKey())).toEqual([
      'node\0node:a\0visibility',
      'property\0property:node:a/title\0value',
    ]);
    expect(reading.facts.map((fact) => fact.value)).toEqual([
      'visible',
      'migration-source:node:a/title',
    ]);
    expect(reading.facts.every((fact) => fact.boundary?.writerId === 'scratch-migration')).toBe(true);
  });

  it('rejects malformed hex bytes instead of partially parsing them', async () => {
    const repositoryPath = await initializedRepository();
    const commitId = await writeScratchPayload(repositoryPath, [
      'git-warp-v18-migration-operation-v1',
      'sequence 0',
      'kind node-record',
      'source-key-utf8-hex 0g',
      'target-key-utf8-hex 6e6f64653a61',
      '',
    ].join('\n'));
    await execFileAsync('git', ['update-ref', SCRATCH_REF, commitId], { cwd: repositoryPath });

    await expect(buildGraphModelMigrationScratchReading({
      repositoryPath,
      scratchRefName: SCRATCH_REF,
      readingId: 'scratch:bad-hex',
    })).rejects.toThrow(/invalid hex byte 0g/);
  });
});

async function initializedRepository(): Promise<string> {
  const repositoryPath = await mkdtemp(join(tmpdir(), 'git-warp-v18-scratch-reading-'));
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
  kind: 'node-record' | 'property',
  sourceKey: string,
  targetKey: string,
): GraphModelMigrationLoweredOperation {
  return new GraphModelMigrationLoweredOperation({ kind, sourceKey, targetKey });
}

async function writeScratchPayload(repositoryPath: string, payload: string): Promise<string> {
  const blobOid = await gitOk(repositoryPath, ['hash-object', '-w', '--stdin'], payload);
  const treeOid = await gitOk(
    repositoryPath,
    ['mktree'],
    `100644 blob ${blobOid}\tmigration-operation.txt\n`,
  );
  return await gitOk(repositoryPath, ['commit-tree', treeOid], 'bad scratch payload\n');
}
