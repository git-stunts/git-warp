import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import {
  buildGraphModelMigrationScratchPublicReadReading,
  createGraphModelMigrationScratchPublicReadProvider,
} from '../../../scripts/v18.0.0/migrations/graph-model/GraphModelMigrationScratchPublicReadBuilder.ts';
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
import GraphModelMigrationScratchWriteResult
  from '../../../src/domain/migrations/GraphModelMigrationScratchWriteResult.ts';

const execFileAsync = promisify(execFile);
const GRAPH_ID = 'v17-golden-graph';
const SCRATCH_REF = 'refs/warp-migration-scratch/v17-golden-graph/public-read';

describe('v18 scratch public-read builder', () => {
  it('builds scratch facts from materialized runtime state', async () => {
    const repositoryPath = await initializedRepository('git-warp-v18-scratch-public-read-');
    const writeResult = await writeGraphModelMigrationScratchHistory({
      repositoryPath,
      scratchRefName: SCRATCH_REF,
      patchPlan: patchPlan([
        operation('node-record', 'node:alpha', 'node:alpha'),
        operation('node-record', 'node:beta', 'node:beta'),
        operation('edge-record', 'edge:alpha-beta', 'node:alpha->node:beta:relates'),
        operation('property', 'node:alpha:title', propertyTarget('node:alpha', 'title')),
      ]),
    });

    const reading = await buildGraphModelMigrationScratchPublicReadReading({
      sourceRepositoryPath: repositoryPath,
      request: replayRequest(writeResult),
      readingId: 'scratch-public-read:unit',
    });

    expect(reading.facts.map((fact) => `${fact.kind}:${fact.factKey}:${fact.fieldPath}:${fact.value}`))
      .toEqual([
        'edge:node:alpha->node:beta:relates:visibility:visible',
        'node:node:alpha:visibility:visible',
        'node:node:beta:visibility:visible',
        'property:node:alpha:title:value:migration-source:node:alpha:title',
      ]);
  });

  it('creates a command provider that reads scratch content through runtime state', async () => {
    const repositoryPath = await initializedRepository('git-warp-v18-scratch-public-read-content-');
    const writeResult = await writeGraphModelMigrationScratchHistory({
      repositoryPath,
      scratchRefName: SCRATCH_REF,
      patchPlan: patchPlan([
        operation('node-record', 'node:alpha', 'node:alpha'),
        operation('content-attachment', 'node:alpha:_content', 'content-attachment:node:alpha:_content'),
      ]),
    });
    const provider = createGraphModelMigrationScratchPublicReadProvider({
      sourceRepositoryPath: repositoryPath,
      graphId: GRAPH_ID,
      readingId: 'scratch-public-read:content',
    });

    const reading = await provider(writeResult);
    const contentFact = requiredFact(reading.facts, 'content-attachment', 'node:alpha:_content');

    expect(reading.facts.map((fact) => `${fact.kind}:${fact.factKey}:${fact.fieldPath}`)).toEqual([
      'content-attachment:node:alpha:_content:payload.oid',
      'node:node:alpha:visibility',
    ]);
    expect(contentFact.value).not.toBe('migration-source:node:alpha:_content');
    expect(contentFact.value.length).toBeGreaterThan(0);
  });

  it('fails closed when the scratch ref drifts before public readback', async () => {
    const repositoryPath = await initializedRepository('git-warp-v18-scratch-public-read-drift-');
    const writeResult = await writeGraphModelMigrationScratchHistory({
      repositoryPath,
      scratchRefName: SCRATCH_REF,
      patchPlan: patchPlan([operation('node-record', 'node:alpha', 'node:alpha')]),
    });
    const replacementHead = await writeBadScratchCommit(repositoryPath);
    await gitOk(repositoryPath, ['update-ref', SCRATCH_REF, replacementHead], null);

    await expect(buildGraphModelMigrationScratchPublicReadReading({
      sourceRepositoryPath: repositoryPath,
      request: replayRequest(writeResult),
      readingId: 'scratch-public-read:drift',
    })).rejects.toThrow(/scratch ref head changed/);
  });
});

function requiredFact(
  facts: readonly { readonly kind: string; readonly factKey: string; readonly value: string }[],
  kind: string,
  factKey: string,
): { readonly value: string } {
  const found = facts.find((fact) => fact.kind === kind && fact.factKey === factKey);
  if (found === undefined) {
    throw new Error(`expected ${kind}:${factKey}`);
  }
  return found;
}

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
  kind: 'node-record' | 'edge-record' | 'property' | 'content-attachment',
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
