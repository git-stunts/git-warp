import { describe, expect, it, vi } from 'vitest';
import InMemoryGraphAdapter from '../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import { openRuntimeHostProduct } from '../../src/domain/warp/RuntimeHostProduct.ts';

describe('graph query bounded read-model provider', () => {
  it('does not materialize the full graph for an exact id-only miss', async () => {
    const graph = await openRuntimeHostProduct({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'bounded-query-red',
      writerId: 'reader',
    });
    const materializeGraph = vi.spyOn(graph, '_materializeGraph');
    materializeGraph.mockRejectedValue(
      new Error('graph.query exact id-only miss must not full-materialize'),
    );

    const result = await graph
      .query()
      .match('node:missing')
      .select(['id'])
      .run();

    expect(materializeGraph).not.toHaveBeenCalled();
    expect(result).toEqual({
      stateHash: expect.any(String),
      nodes: [],
    });
  });
});
