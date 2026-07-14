import { describe, expect, it } from 'vitest';
import { openMemoryRuntimeHostProduct as openRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';
import InMemoryGraphAdapter from '../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';

const BASE_NODE_ID = 'bounded:base';
const TAIL_NODE_ID = 'bounded:tail';
const MISSING_NODE_ID = 'bounded:missing';

describe('post-v17 blocked witness: graph query bounded read-model provider', () => {
  it('answers exact id-only graph.query from checkpoint plus live tail without full materialization', async () => {
    const persistence = new InMemoryGraphAdapter();
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: 'bounded-query-provider',
      writerId: 'writer-1',
    });
    await graph.patch((patch) => {
      patch.addNode(BASE_NODE_ID);
    });
    await graph.materialize();
    await graph.createCheckpoint();
    await graph.patch((patch) => {
      patch.addNode(TAIL_NODE_ID);
    });
    graph._ensureFreshState = async () => {
      throw new Error('full materialization trap');
    };

    const base = await graph.query().match(BASE_NODE_ID).select(['id']).run();
    const tail = await graph.query().match(TAIL_NODE_ID).select(['id']).run();
    const missing = await graph.query().match(MISSING_NODE_ID).select(['id']).run();

    expect(base).toMatchObject({
      nodes: [{ id: BASE_NODE_ID }],
    });
    expect(tail).toMatchObject({
      nodes: [{ id: TAIL_NODE_ID }],
    });
    expect(missing).toMatchObject({
      nodes: [],
    });
    expect(base.stateHash).toContain('checkpoint-tail-query:');
    expect(tail.stateHash).toContain('checkpoint-tail-query:');
    expect(missing.stateHash).toContain('checkpoint-tail-query:');
  });
});
