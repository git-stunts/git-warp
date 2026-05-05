import { describe, it, expect } from 'vitest';
import {
  encodeEdgeKey,
  encodeEdgePropKey,
  encodePropKey,
} from '../../../src/domain/services/JoinReducer.ts';
import { createStateBuilder } from '../../helpers/stateBuilder.ts';

describe('StateBuilder', () => {
  it('builds nodes, edges, properties, and observed frontier fluently', () => {
    const state = createStateBuilder()
      .node('node:a', { counter: 1 })
      .node('node:b', { counter: 2 })
      .edge('node:a', 'node:b', 'knows', { counter: 3, lamport: 5 })
      .nodeProp('node:a', 'name', 'Alice', { lamport: 6 })
      .edgeProp('node:a', 'node:b', 'knows', 'weight', 9, { lamport: 7 })
      .vv('w1', 3)
      .build();

    expect(state.nodeAlive.contains('node:a')).toBe(true);
    expect(state.nodeAlive.contains('node:b')).toBe(true);
    expect(state.edgeAlive.contains(encodeEdgeKey('node:a', 'node:b', 'knows'))).toBe(true);
    expect(state.prop.get(encodePropKey('node:a', 'name'))?.value).toBe('Alice');
    expect(state.prop.get(encodeEdgePropKey('node:a', 'node:b', 'knows', 'weight'))?.value).toBe(9);
    expect(state.observedFrontier.get('w1')).toBe(3);
    expect(state.edgeBirthEvent.get(encodeEdgeKey('node:a', 'node:b', 'knows'))?.lamport).toBe(5);
  });

  it('removes observed node and edge dots by default', () => {
    const state = createStateBuilder()
      .node('node:a', { counter: 1 })
      .node('node:b', { counter: 2 })
      .edge('node:a', 'node:b', 'knows', { counter: 3 })
      .removeNode('node:a')
      .removeEdge('node:a', 'node:b', 'knows')
      .build();

    expect(state.nodeAlive.contains('node:a')).toBe(false);
    expect(state.edgeAlive.contains(encodeEdgeKey('node:a', 'node:b', 'knows'))).toBe(false);
  });

  it('seedGraph installs the built state as the cached materialized view', async () => {
        const graph = ({}) as any;
    const state = createStateBuilder()
      .node('node:a', { counter: 1 })
      .seedGraph(graph);

    expect(graph._cachedState).toBe(state);
    await expect(graph.materialize()).resolves.toBe(state);
  });
});
