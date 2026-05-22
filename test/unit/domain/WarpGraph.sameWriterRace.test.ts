import { describe, expect, it } from 'vitest';
import InMemoryGraphAdapter from '../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import { buildWriterRef } from '../../../src/domain/utils/RefLayout.ts';
import WriterError from '../../../src/domain/errors/WriterError.ts';

const GRAPH_NAME = 'same-writer-race';
const WRITER_ID = 'writer-a';
const FIRST_NODE = 'node:first';
const SECOND_NODE = 'node:second';

function fulfilledCommitShas(results: readonly PromiseSettledResult<string>[]): string[] {
  const shas: string[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      shas.push(result.value);
    }
  }
  return shas;
}

function rejectedWriterErrors(results: readonly PromiseSettledResult<string>[]): WriterError[] {
  const errors: WriterError[] = [];
  for (const result of results) {
    if (result.status === 'rejected' && result.reason instanceof WriterError) {
      errors.push(result.reason);
    }
  }
  return errors;
}

function winningNodeId(results: readonly PromiseSettledResult<string>[]): string {
  if (results[0]?.status === 'fulfilled') {
    return FIRST_NODE;
  }
  return SECOND_NODE;
}

function losingNodeId(results: readonly PromiseSettledResult<string>[]): string {
  if (results[0]?.status === 'fulfilled') {
    return SECOND_NODE;
  }
  return FIRST_NODE;
}

describe('same-writer concurrent patch race', () => {
  it('leaves only the winning stale builder on the final frontier and visible state', async () => {
    const persistence = new InMemoryGraphAdapter();
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: GRAPH_NAME,
      writerId: WRITER_ID,
      autoMaterialize: true,
    });

    const firstPatch = await graph.createPatch();
    firstPatch.addNode(FIRST_NODE);

    const secondPatch = await graph.createPatch();
    secondPatch.addNode(SECOND_NODE);

    const results = await Promise.allSettled([
      firstPatch.commit(),
      secondPatch.commit(),
    ]);
    const winners = fulfilledCommitShas(results);
    const rejected = rejectedWriterErrors(results);

    expect(winners).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.code).toBe('WRITER_CAS_CONFLICT');

    const writerRef = buildWriterRef(GRAPH_NAME, WRITER_ID);
    expect(await persistence.readRef(writerRef)).toBe(winners[0]);

    await graph.materialize();
    const winnerNode = winningNodeId(results);
    const loserNode = losingNodeId(results);
    const firstVisible = await graph.hasNode(FIRST_NODE);
    const secondVisible = await graph.hasNode(SECOND_NODE);

    expect([firstVisible, secondVisible].filter(Boolean)).toHaveLength(1);
    expect(await graph.hasNode(winnerNode)).toBe(true);
    expect(await graph.hasNode(loserNode)).toBe(false);
  });
});
