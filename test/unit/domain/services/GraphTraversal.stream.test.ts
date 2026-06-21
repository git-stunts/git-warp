import { describe, expect, it } from 'vitest';

import type { Direction, NeighborOptions } from '../../../../src/ports/NeighborProviderPort.ts';
import NeighborProviderPort, { NeighborEdge, type LatencyClass } from '../../../../src/ports/NeighborProviderPort.ts';
import GraphTraversal from '../../../../src/domain/services/query/GraphTraversal.ts';
import {
  F1_BFS_LEVEL_SORT_TRAP,
  F2_DFS_LEFTMOST_REVERSE_PUSH,
  makeAdjacencyProvider,
} from '../../../helpers/fixtureDsl.ts';

async function collectNodes(stream: AsyncIterable<string>): Promise<string[]> {
  const nodes: string[] = [];
  for await (const node of stream) {
    nodes.push(node);
  }
  return nodes;
}

class CountingNeighborProvider extends NeighborProviderPort {
  expansionCount = 0;

  async getNeighbors(
    nodeId: string,
    _direction: Direction,
    _options?: NeighborOptions,
  ): Promise<NeighborEdge[]> {
    this.expansionCount += 1;
    if (nodeId === 'A') {
      return [new NeighborEdge('B', '')];
    }
    return [];
  }

  async hasNode(nodeId: string): Promise<boolean> {
    return nodeId === 'A' || nodeId === 'B';
  }

  override get latencyClass(): LatencyClass {
    return 'sync';
  }
}

describe('GraphTraversal stream traversals', () => {
  it('streams BFS nodes in the same deterministic order as bfs()', async () => {
    const provider = makeAdjacencyProvider(F1_BFS_LEVEL_SORT_TRAP);
    const engine = new GraphTraversal({ provider });

    const streamed = await collectNodes(engine.bfsStream({ start: 'A' }));
    const collected = await engine.bfs({ start: 'A' });

    expect(streamed).toEqual(['A', 'B', 'C', 'D', 'Z']);
    expect(streamed).toEqual(collected.nodes);
  });

  it('streams DFS nodes in the same deterministic order as dfs()', async () => {
    const provider = makeAdjacencyProvider(F2_DFS_LEFTMOST_REVERSE_PUSH);
    const engine = new GraphTraversal({ provider });

    const streamed = await collectNodes(engine.dfsStream({ start: 'A' }));
    const collected = await engine.dfs({ start: 'A' });

    expect(streamed).toEqual(['A', 'B', 'D', 'C', 'E']);
    expect(streamed).toEqual(collected.nodes);
  });

  it('does not expand after a consumer stops at the first BFS item', async () => {
    const provider = new CountingNeighborProvider();
    const engine = new GraphTraversal({ provider });
    const seen: string[] = [];

    for await (const node of engine.bfsStream({ start: 'A' })) {
      seen.push(node);
      break;
    }

    expect(seen).toEqual(['A']);
    expect(provider.expansionCount).toBe(0);
  });
});
