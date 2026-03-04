/**
 * GraphTraversal.levels() — longest-path level assignment.
 */

import { describe, it, expect } from 'vitest';
import GraphTraversal from '../../../../src/domain/services/GraphTraversal.js';
import {
  makeAdjacencyProvider,
  F3_DIAMOND_EQUAL_PATHS,
  F8_TOPO_CYCLE_3,
  F15_WIDE_DAG_FOR_LEVELS,
} from '../../../helpers/fixtureDsl.js';

describe('GraphTraversal.levels()', () => {
  describe('F15 — wide DAG level assignment', () => {
    it('assigns longest-path levels', async () => {
      const provider = makeAdjacencyProvider(F15_WIDE_DAG_FOR_LEVELS);
      const engine = new GraphTraversal({ provider });
      const { levels, maxLevel } = await engine.levels({ start: 'A' });

      expect(levels.get('A')).toBe(0);
      expect(levels.get('B')).toBe(1);
      expect(levels.get('C')).toBe(1);
      expect(levels.get('D')).toBe(2);
      expect(levels.get('E')).toBe(3);
      expect(maxLevel).toBe(3);
    });

    it('returns stats', async () => {
      const provider = makeAdjacencyProvider(F15_WIDE_DAG_FOR_LEVELS);
      const engine = new GraphTraversal({ provider });
      const { stats } = await engine.levels({ start: 'A' });

      expect(stats.nodesVisited).toBe(5);
      expect(stats.edgesTraversed).toBeGreaterThanOrEqual(5);
    });
  });

  describe('F3 — diamond equal paths', () => {
    it('assigns correct levels for diamond', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const { levels, maxLevel } = await engine.levels({ start: 'A' });

      expect(levels.get('A')).toBe(0);
      expect(levels.get('B')).toBe(1);
      expect(levels.get('C')).toBe(1);
      expect(levels.get('D')).toBe(2);
      expect(maxLevel).toBe(2);
    });
  });

  describe('single node', () => {
    it('assigns level 0 to a lone start', async () => {
      const provider = makeAdjacencyProvider(F15_WIDE_DAG_FOR_LEVELS);
      const engine = new GraphTraversal({ provider });
      const { levels, maxLevel } = await engine.levels({ start: 'E' });

      expect(levels.get('E')).toBe(0);
      expect(maxLevel).toBe(0);
      expect(levels.size).toBe(1);
    });
  });

  describe('multiple starts', () => {
    it('accepts array of start nodes', async () => {
      const provider = makeAdjacencyProvider(F15_WIDE_DAG_FOR_LEVELS);
      const engine = new GraphTraversal({ provider });
      const { levels } = await engine.levels({ start: ['A', 'B'] });

      expect(levels.get('A')).toBe(0);
      expect(levels.get('B')).toBe(1);
    });
  });

  describe('cycle detection', () => {
    it('throws ERR_GRAPH_HAS_CYCLES on cyclic graph', async () => {
      const provider = makeAdjacencyProvider(F8_TOPO_CYCLE_3);
      const engine = new GraphTraversal({ provider });

      await expect(engine.levels({ start: 'A' })).rejects.toThrow(
        expect.objectContaining({
          code: 'ERR_GRAPH_HAS_CYCLES',
        }),
      );
    });
  });

  describe('INVALID_START', () => {
    it('throws when start node does not exist', async () => {
      const provider = makeAdjacencyProvider(F15_WIDE_DAG_FOR_LEVELS);
      const engine = new GraphTraversal({ provider });

      await expect(engine.levels({ start: 'NOPE' })).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_START',
        }),
      );
    });
  });

  describe('AbortSignal', () => {
    it('respects cancellation', async () => {
      const provider = makeAdjacencyProvider(F15_WIDE_DAG_FOR_LEVELS);
      const engine = new GraphTraversal({ provider });
      const controller = new AbortController();
      controller.abort();

      await expect(
        engine.levels({ start: 'A', signal: controller.signal }),
      ).rejects.toThrow();
    });
  });
});
