/**
 * F10 — Proto pollution safety.
 *
 * Proves that nodeIds like '__proto__', 'constructor', 'toString'
 * don't corrupt Object.prototype when used in adjacency maps,
 * provider lookups, or (later) index shards.
 */

import { describe, it, expect } from 'vitest';
import {
  makeAdjacencyProvider, toAdjacencyMaps,
  F10_PROTO_POLLUTION,
} from '../../helpers/fixtureDsl.ts';
import GraphTraversal from '../../../src/domain/services/query/GraphTraversal.ts';

describe('F10 — PROTO_POLLUTION_IDS', () => {
  describe('AdjacencyNeighborProvider', () => {
    it('does not mutate Object.prototype', async () => {
      // Snapshot prototype state
      const beforePolluted = (({} as Record<string, unknown>))['polluted'];
      const beforeConstructor = ({}).constructor;
      const beforeToString = ({}).toString;

      const provider = makeAdjacencyProvider(F10_PROTO_POLLUTION);

      // Build and exercise the provider
      await provider.getNeighbors('__proto__', 'out');
      await provider.getNeighbors('constructor', 'out');
      await provider.getNeighbors('toString', 'out');
      await provider.hasNode('__proto__');
      await provider.hasNode('constructor');

      // Object.prototype unchanged
      expect((({} as Record<string, unknown>))['polluted']).toBe(beforePolluted);
      expect(({}).constructor).toBe(beforeConstructor);
      expect(({}).toString).toBe(beforeToString);
    });

    it('lookups for proto-like nodeIds work normally', async () => {
      const provider = makeAdjacencyProvider(F10_PROTO_POLLUTION);

      expect(await provider.hasNode('__proto__')).toBe(true);
      expect(await provider.hasNode('constructor')).toBe(true);
      expect(await provider.hasNode('toString')).toBe(true);
      expect(await provider.hasNode('node:1')).toBe(true);

      const out = await provider.getNeighbors('node:1', 'out');
      expect(out).toEqual([{ neighborId: '__proto__', label: 'owns' }]);

      const out2 = await provider.getNeighbors('__proto__', 'out');
      expect(out2).toEqual([{ neighborId: 'constructor', label: 'owns' }]);
    });
  });

  describe('toAdjacencyMaps', () => {
    it('adjacency maps handle proto-like keys safely', () => {
      const { outgoing, incoming: _incoming, aliveNodes } = toAdjacencyMaps(F10_PROTO_POLLUTION);

      // Maps keyed by proto-like strings should work
      expect(outgoing.get('__proto__')).toBeDefined();
      expect(aliveNodes.has('__proto__')).toBe(true);
      expect(aliveNodes.has('constructor')).toBe(true);

      // Object.prototype not mutated
      expect((({} as Record<string, unknown>))['polluted']).toBeUndefined();
    });
  });

  describe('GraphTraversal with proto-like node IDs', () => {
    it('BFS traverses through proto-like nodes', async () => {
      const provider = makeAdjacencyProvider(F10_PROTO_POLLUTION);
      const engine = new GraphTraversal({ provider });
      const { nodes } = await engine.bfs({ start: 'node:1' });

      // node:1 → __proto__ → constructor
      expect(nodes).toContain('__proto__');
      expect(nodes).toContain('constructor');

      // Object.prototype not mutated
      expect((({} as Record<string, unknown>))['polluted']).toBeUndefined();
    });

    it('shortestPath works with proto-like endpoints', async () => {
      const provider = makeAdjacencyProvider(F10_PROTO_POLLUTION);
      const engine = new GraphTraversal({ provider });
      const result = await engine.shortestPath({
        start: 'node:1',
        goal: 'constructor',
      });

      expect(result.found).toBe(true);
      expect(result.path).toEqual(['node:1', '__proto__', 'constructor']);
    });

    it('topologicalSort handles proto-like nodes', async () => {
      const provider = makeAdjacencyProvider(F10_PROTO_POLLUTION);
      const engine = new GraphTraversal({ provider });
      const { sorted, hasCycle } = await engine.topologicalSort({ start: 'node:1' });

      expect(hasCycle).toBe(false);
      expect(sorted).toContain('__proto__');
      expect(sorted).toContain('constructor');
    });
  });
});
