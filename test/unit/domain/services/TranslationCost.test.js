import { describe, it, expect, beforeEach, vi } from 'vitest';
import WarpGraph from '../../../../src/domain/WarpGraph.js';
import { createEmptyStateV5, encodeEdgeKey, encodePropKey } from '../../../../src/domain/services/JoinReducer.js';
import { orsetAdd } from '../../../../src/domain/crdt/ORSet.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';
import { computeTranslationCost } from '../../../../src/domain/services/TranslationCost.js';

/** @param {any} graph @param {(state: any) => void} seedFn */
function setupGraphState(graph, seedFn) {
  const state = createEmptyStateV5();
  graph._cachedState = state;
  graph.materialize = vi.fn().mockResolvedValue(state);
  seedFn(state);
  return state;
}

/** @param {any} state @param {any} nodeId @param {any} counter */
function addNode(state, nodeId, counter) {
  orsetAdd(state.nodeAlive, nodeId, createDot('w1', counter));
}

/** @param {any} state @param {any} from @param {any} to @param {any} label @param {any} counter */
function addEdge(state, from, to, label, counter) {
  const edgeKey = encodeEdgeKey(from, to, label);
  orsetAdd(state.edgeAlive, edgeKey, createDot('w1', counter));
}

/** @param {any} state @param {any} nodeId @param {any} key @param {any} value */
function addProp(state, nodeId, key, value) {
  const propKey = encodePropKey(nodeId, key);
  state.prop.set(propKey, { value, lamport: 1, writerId: 'w1' });
}

describe('TranslationCost', () => {
  /** @type {any} */
  let mockPersistence;
  /** @type {any} */
  let graph;

  beforeEach(async () => {
    mockPersistence = {
      readRef: vi.fn().mockResolvedValue(null),
      listRefs: vi.fn().mockResolvedValue([]),
      updateRef: vi.fn().mockResolvedValue(undefined),
      configGet: vi.fn().mockResolvedValue(null),
      configSet: vi.fn().mockResolvedValue(undefined),
    };

    graph = await WarpGraph.open({
      persistence: mockPersistence,
      graphName: 'test',
      writerId: 'writer-1',
    });
  });

  describe('computeTranslationCost (unit)', () => {
    it('identical configs produce cost 0', () => {
      const state = createEmptyStateV5();
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);

      const config = { match: 'user:*' };
      const result = computeTranslationCost(config, config, state);

      expect(result.cost).toBe(0);
      expect(result.breakdown.nodeLoss).toBe(0);
      expect(result.breakdown.edgeLoss).toBe(0);
      expect(result.breakdown.propLoss).toBe(0);
    });

    it('completely disjoint match patterns produce cost 1', () => {
      const state = createEmptyStateV5();
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addNode(state, 'team:eng', 3);
      addEdge(state, 'user:alice', 'user:bob', 'follows', 4);
      addProp(state, 'user:alice', 'name', 'Alice');

      const configA = { match: 'user:*' };
      const configB = { match: 'team:*' };

      const result = computeTranslationCost(configA, configB, state);

      expect(result.cost).toBe(1);
      expect(result.breakdown.nodeLoss).toBe(1);
      expect(result.breakdown.edgeLoss).toBe(1);
      expect(result.breakdown.propLoss).toBe(1);
    });

    it('A sees everything, B sees subset -> cost > 0', () => {
      const state = createEmptyStateV5();
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addNode(state, 'team:eng', 3);

      const configA = { match: '*' };
      const configB = { match: 'user:*' };

      const result = computeTranslationCost(configA, configB, state);

      expect(result.cost).toBeGreaterThan(0);
      // 1 of 3 nodes lost => nodeLoss = 1/3
      expect(result.breakdown.nodeLoss).toBeCloseTo(1 / 3, 10);
    });

    it('A sees subset, B sees everything -> cost 0', () => {
      const state = createEmptyStateV5();
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addNode(state, 'team:eng', 3);

      const configA = { match: 'user:*' };
      const configB = { match: '*' };

      const result = computeTranslationCost(configA, configB, state);

      expect(result.cost).toBe(0);
      expect(result.breakdown.nodeLoss).toBe(0);
      expect(result.breakdown.edgeLoss).toBe(0);
      expect(result.breakdown.propLoss).toBe(0);
    });

    it('A sees nothing -> cost 0', () => {
      const state = createEmptyStateV5();
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);

      const configA = { match: 'nonexistent:*' };
      const configB = { match: 'user:*' };

      const result = computeTranslationCost(configA, configB, state);

      expect(result.cost).toBe(0);
    });

    it('both see everything -> cost 0', () => {
      const state = createEmptyStateV5();
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addNode(state, 'team:eng', 3);
      addEdge(state, 'user:alice', 'user:bob', 'follows', 4);
      addProp(state, 'user:alice', 'name', 'Alice');

      const configA = { match: '*' };
      const configB = { match: '*' };

      const result = computeTranslationCost(configA, configB, state);

      expect(result.cost).toBe(0);
      expect(result.breakdown.nodeLoss).toBe(0);
      expect(result.breakdown.edgeLoss).toBe(0);
      expect(result.breakdown.propLoss).toBe(0);
    });

    it('property redaction causes propLoss', () => {
      const state = createEmptyStateV5();
      addNode(state, 'user:alice', 1);
      addProp(state, 'user:alice', 'name', 'Alice');
      addProp(state, 'user:alice', 'ssn', '123-45-6789');
      addProp(state, 'user:alice', 'email', 'alice@example.com');

      const configA = { match: 'user:*' };
      const configB = { match: 'user:*', redact: ['ssn'] };

      const result = computeTranslationCost(configA, configB, state);

      expect(result.cost).toBeGreaterThan(0);
      expect(result.breakdown.nodeLoss).toBe(0);
      expect(result.breakdown.edgeLoss).toBe(0);
      // 1 of 3 props lost
      expect(result.breakdown.propLoss).toBeCloseTo(1 / 3, 10);
    });

    it('edge loss when observer B match excludes an endpoint', () => {
      const state = createEmptyStateV5();
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addNode(state, 'team:eng', 3);
      addEdge(state, 'user:alice', 'user:bob', 'follows', 4);
      addEdge(state, 'user:alice', 'team:eng', 'belongs-to', 5);

      // A sees everything
      const configA = { match: '*' };
      // B only sees users (team:eng excluded)
      const configB = { match: 'user:*' };

      const result = computeTranslationCost(configA, configB, state);

      // 1 of 3 nodes lost, 1 of 2 edges lost
      expect(result.breakdown.nodeLoss).toBeCloseTo(1 / 3, 10);
      expect(result.breakdown.edgeLoss).toBeCloseTo(1 / 2, 10);
    });

    it('breakdown object has correct fields', () => {
      const state = createEmptyStateV5();
      addNode(state, 'user:alice', 1);

      const configA = { match: '*' };
      const configB = { match: '*' };

      const result = computeTranslationCost(configA, configB, state);

      expect(result).toHaveProperty('cost');
      expect(result).toHaveProperty('breakdown');
      expect(result.breakdown).toHaveProperty('nodeLoss');
      expect(result.breakdown).toHaveProperty('edgeLoss');
      expect(result.breakdown).toHaveProperty('propLoss');
      expect(typeof result.cost).toBe('number');
      expect(typeof result.breakdown.nodeLoss).toBe('number');
      expect(typeof result.breakdown.edgeLoss).toBe('number');
      expect(typeof result.breakdown.propLoss).toBe('number');
    });

    it('empty graph produces cost 0', () => {
      const state = createEmptyStateV5();

      const configA = { match: '*' };
      const configB = { match: '*' };

      const result = computeTranslationCost(configA, configB, state);

      expect(result.cost).toBe(0);
    });

    it('expose filter on A limits what is countable', () => {
      const state = createEmptyStateV5();
      addNode(state, 'user:alice', 1);
      addProp(state, 'user:alice', 'name', 'Alice');
      addProp(state, 'user:alice', 'ssn', '123-45-6789');
      addProp(state, 'user:alice', 'email', 'alice@example.com');

      // A only exposes name
      const configA = { match: 'user:*', expose: ['name'] };
      // B sees nothing (different match)
      const configB = { match: 'team:*' };

      const result = computeTranslationCost(configA, configB, state);

      // 1 node lost, 1 prop lost (name)
      expect(result.breakdown.nodeLoss).toBe(1);
      expect(result.breakdown.propLoss).toBe(1);
    });

    it('cost is normalized to [0, 1] range', () => {
      const state = createEmptyStateV5();
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addNode(state, 'team:eng', 3);
      addNode(state, 'team:sales', 4);
      addEdge(state, 'user:alice', 'user:bob', 'follows', 5);
      addEdge(state, 'team:eng', 'team:sales', 'related', 6);
      addProp(state, 'user:alice', 'name', 'Alice');
      addProp(state, 'team:eng', 'dept', 'Engineering');

      const configA = { match: '*' };
      const configB = { match: 'user:*' };

      const result = computeTranslationCost(configA, configB, state);

      expect(result.cost).toBeGreaterThanOrEqual(0);
      expect(result.cost).toBeLessThanOrEqual(1);
    });
  });

  describe('graph.translationCost() integration', () => {
    it('returns cost 0 for identical configs', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addNode(state, 'user:bob', 2);
      });

      const result = await graph.translationCost(
        { match: 'user:*' },
        { match: 'user:*' }
      );

      expect(result.cost).toBe(0);
      expect(result.breakdown.nodeLoss).toBe(0);
    });

    it('returns cost > 0 for superset -> subset', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addNode(state, 'user:bob', 2);
        addNode(state, 'team:eng', 3);
      });

      const result = await graph.translationCost(
        { match: '*' },
        { match: 'user:*' }
      );

      expect(result.cost).toBeGreaterThan(0);
    });

    it('returns cost 0 for subset -> superset', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addNode(state, 'team:eng', 2);
      });

      const result = await graph.translationCost(
        { match: 'user:*' },
        { match: '*' }
      );

      expect(result.cost).toBe(0);
    });

    it('captures property redaction in breakdown', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addProp(state, 'user:alice', 'name', 'Alice');
        addProp(state, 'user:alice', 'ssn', '123-45-6789');
      });

      const result = await graph.translationCost(
        { match: 'user:*' },
        { match: 'user:*', redact: ['ssn'] }
      );

      expect(result.breakdown.propLoss).toBeCloseTo(0.5, 10);
      expect(result.breakdown.nodeLoss).toBe(0);
      expect(result.breakdown.edgeLoss).toBe(0);
      // cost = 0.5*0 + 0.3*0 + 0.2*0.5 = 0.1
      expect(result.cost).toBeCloseTo(0.1, 10);
    });
  });
});
