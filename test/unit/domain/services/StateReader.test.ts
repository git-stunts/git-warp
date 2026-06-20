import { describe, expect, it } from 'vitest';

import { createStateReader } from '../../../../src/domain/services/state/StateReader.ts';
import { createStateBuilder } from '../../../helpers/stateBuilder.ts';

describe('StateReader', () => {
  it('projects visible nodes, edges, properties, and neighbors', () => {
    const state = createStateBuilder()
      .node('node:a')
      .node('node:b')
      .node('node:c')
      .edge('node:a', 'node:b', 'knows')
      .edge('node:a', 'node:c', 'likes')
      .edge('node:b', 'node:a', 'replies')
      .nodeProp('node:a', 'status', 'ready')
      .nodeProp('node:b', 'rank', 2)
      .edgeProp('node:a', 'node:b', 'knows', 'weight', 3)
      .build();

    const reader = createStateReader(state);

    expect(reader.project()).toEqual({
      nodes: ['node:a', 'node:b', 'node:c'],
      edges: [
        { from: 'node:a', to: 'node:b', label: 'knows' },
        { from: 'node:a', to: 'node:c', label: 'likes' },
        { from: 'node:b', to: 'node:a', label: 'replies' },
      ],
      props: [
        { node: 'node:a', key: 'status', value: 'ready' },
        { node: 'node:b', key: 'rank', value: 2 },
      ],
    });
    expect(reader.hasNode('node:a')).toBe(true);
    expect(reader.getNodes()).toEqual(['node:a', 'node:b', 'node:c']);
    expect(reader.getEdges()).toEqual([
      { from: 'node:a', to: 'node:b', label: 'knows', props: { weight: 3 } },
      { from: 'node:a', to: 'node:c', label: 'likes', props: {} },
      { from: 'node:b', to: 'node:a', label: 'replies', props: {} },
    ]);
    expect(reader.getNodeProps('node:a')).toEqual({ status: 'ready' });
    expect(reader.getEdgeProps('node:a', 'node:b', 'knows')).toEqual({ weight: 3 });
    expect(reader.neighbors('node:a', 'outgoing')).toEqual([
      { nodeId: 'node:b', label: 'knows', direction: 'outgoing' },
      { nodeId: 'node:c', label: 'likes', direction: 'outgoing' },
    ]);
    expect(reader.neighbors('node:a', 'incoming')).toEqual([
      { nodeId: 'node:b', label: 'replies', direction: 'incoming' },
    ]);
    expect(reader.neighbors('node:a', 'both', 'knows')).toEqual([
      { nodeId: 'node:b', label: 'knows', direction: 'outgoing' },
    ]);
    expect(reader.inspectNode('node:a')).toEqual({
      nodeId: 'node:a',
      props: { status: 'ready' },
      outgoing: [
        { nodeId: 'node:b', label: 'knows', direction: 'outgoing' },
        { nodeId: 'node:c', label: 'likes', direction: 'outgoing' },
      ],
      incoming: [
        { nodeId: 'node:b', label: 'replies', direction: 'incoming' },
      ],
      content: null,
    });
  });

  it('returns null or empty views for invisible entities', () => {
    const state = createStateBuilder()
      .node('node:a')
      .nodeProp('node:a', 'status', 'ready')
      .build();

    const reader = createStateReader(state);

    expect(reader.hasNode('node:missing')).toBe(false);
    expect(reader.getNodeProps('node:missing')).toBeNull();
    expect(reader.getEdgeProps('node:a', 'node:missing', 'knows')).toBeNull();
    expect(reader.neighbors('node:missing')).toEqual([]);
    expect(reader.getNodeContentMeta('node:missing')).toBeNull();
    expect(reader.getEdgeContentMeta('node:a', 'node:missing', 'knows')).toBeNull();
    expect(reader.inspectNode('node:missing')).toBeNull();
  });

  it('returns fresh cloned views without exposing internal mutable indexes', () => {
    const state = createStateBuilder()
      .node('node:a')
      .node('node:b')
      .edge('node:a', 'node:b', 'knows')
      .nodeProp('node:a', 'status', 'ready')
      .edgeProp('node:a', 'node:b', 'knows', 'weight', 3)
      .build();

    const reader = createStateReader(state);

    const firstNodeProps = reader.getNodeProps('node:a');
    const secondNodeProps = reader.getNodeProps('node:a');
    const firstEdges = reader.getEdges();
    const secondEdges = reader.getEdges();
    const firstNeighbors = reader.neighbors('node:a');
    const secondNeighbors = reader.neighbors('node:a');

    expect(firstNodeProps).toEqual({ status: 'ready' });
    expect(secondNodeProps).toEqual({ status: 'ready' });
    expect(firstNodeProps).not.toBe(secondNodeProps);
    expect(Object.isFrozen(firstNodeProps)).toBe(true);
    expect(firstEdges).not.toBe(secondEdges);
    expect(firstEdges[0]).not.toBe(secondEdges[0]);
    expect(firstNeighbors).not.toBe(secondNeighbors);
    expect(firstNeighbors[0]).not.toBe(secondNeighbors[0]);
  });
});
