import { describe, expect, it } from 'vitest';

import { compareVisibleState } from '../../../../src/domain/services/comparison/VisibleStateComparison.ts';
import { createStateBuilder } from '../../../helpers/stateBuilder.ts';

describe('VisibleStateComparison', () => {
  it('reports deterministic visible topology and property deltas', () => {
    const left = createStateBuilder()
      .node('alpha')
      .node('legacy')
      .edge('legacy', 'alpha', 'old')
      .nodeProp('alpha', 'status', 'old')
      .nodeProp('legacy', 'retired', true)
      .edgeProp('legacy', 'alpha', 'old', 'weight', 1)
      .build();

    const right = createStateBuilder()
      .node('alpha')
      .node('beta')
      .edge('alpha', 'beta', 'fresh')
      .nodeProp('alpha', 'status', 'new')
      .nodeProp('beta', 'kind', 'fresh')
      .edgeProp('alpha', 'beta', 'fresh', 'weight', 2)
      .build();

    const comparison = compareVisibleState(left, right, { targetId: 'alpha' });

    expect(comparison.comparisonVersion).toBe('visible-state-compare/v1');
    expect(comparison.changed).toBe(true);
    expect(comparison.summary).toEqual({
      left: {
        nodeCount: 2,
        edgeCount: 1,
        nodePropertyCount: 2,
        edgePropertyCount: 1,
      },
      right: {
        nodeCount: 2,
        edgeCount: 1,
        nodePropertyCount: 2,
        edgePropertyCount: 1,
      },
      nodes: { added: 1, removed: 1 },
      edges: { added: 1, removed: 1 },
      nodeProperties: { added: 1, removed: 1, changed: 1 },
      edgeProperties: { added: 1, removed: 1, changed: 0 },
    });
    expect(comparison.nodes).toEqual({
      added: ['beta'],
      removed: ['legacy'],
    });
    expect(comparison.edges).toEqual({
      added: [{ from: 'alpha', to: 'beta', label: 'fresh' }],
      removed: [{ from: 'legacy', to: 'alpha', label: 'old' }],
    });
    expect(comparison.nodeProperties).toEqual({
      added: [{ node: 'beta', key: 'kind', value: 'fresh' }],
      removed: [{ node: 'legacy', key: 'retired', value: true }],
      changed: [{ node: 'alpha', key: 'status', leftValue: 'old', rightValue: 'new' }],
    });
    expect(comparison.edgeProperties).toEqual({
      added: [{ from: 'alpha', to: 'beta', label: 'fresh', key: 'weight', value: 2 }],
      removed: [{ from: 'legacy', to: 'alpha', label: 'old', key: 'weight', value: 1 }],
      changed: [],
    });
    expect(comparison.target).toMatchObject({
      targetId: 'alpha',
      leftExists: true,
      rightExists: true,
      changed: true,
      contentChanged: false,
    });
  });

  it('reports no changes for identical visible states', () => {
    const state = createStateBuilder()
      .node('alpha')
      .nodeProp('alpha', 'status', 'ready')
      .build();

    const comparison = compareVisibleState(state, state, { targetId: 'alpha' });

    expect(comparison.changed).toBe(false);
    expect(comparison.nodes).toEqual({ added: [], removed: [] });
    expect(comparison.edges).toEqual({ added: [], removed: [] });
    expect(comparison.nodeProperties).toEqual({ added: [], removed: [], changed: [] });
    expect(comparison.edgeProperties).toEqual({ added: [], removed: [], changed: [] });
    expect(comparison.target).toMatchObject({
      targetId: 'alpha',
      leftExists: true,
      rightExists: true,
      changed: false,
    });
  });
});
