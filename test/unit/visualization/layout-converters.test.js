import { describe, it, expect } from 'vitest';
import {
  queryResultToGraphData,
  pathResultToGraphData,
  rawGraphToGraphData,
} from '../../../src/visualization/layouts/converters.js';

describe('layout converters', () => {
  describe('queryResultToGraphData', () => {
    it('converts payload and filters edges to matched nodes', () => {
      const payload = {
        nodes: [
          { id: 'a', props: { name: 'Alice' } },
          { id: 'b', props: { name: 'Bob' } },
        ],
      };
      const edges = [
        { from: 'a', to: 'b', label: 'knows' },
        { from: 'a', to: 'c', label: 'manages' }, // c not in query result
        { from: 'x', to: 'a', label: 'follows' }, // x not in query result
      ];

      const result = queryResultToGraphData(payload, edges);

      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0]).toEqual({ id: 'a', label: 'a', props: { name: 'Alice' } });
      expect(result.nodes[1]).toEqual({ id: 'b', label: 'b', props: { name: 'Bob' } });
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0]).toEqual({ from: 'a', to: 'b', label: 'knows' });
    });

    it('handles empty payload', () => {
      const result = queryResultToGraphData({}, []);
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
    });

    it('handles null payload', () => {
      const result = queryResultToGraphData(null, null);
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
    });

    it('handles nodes with no matching edges', () => {
      const payload = { nodes: [{ id: 'solo' }] };
      const edges = [{ from: 'x', to: 'y', label: 'link' }];

      const result = queryResultToGraphData(payload, edges);
      expect(result.nodes).toHaveLength(1);
      expect(result.edges).toEqual([]);
    });
  });

  describe('pathResultToGraphData', () => {
    it('converts a path with edge labels', () => {
      const payload = {
        path: ['a', 'b', 'c'],
        edges: ['e1', 'e2'],
      };

      const result = pathResultToGraphData(payload);

      expect(result.nodes).toEqual([
        { id: 'a', label: 'a' },
        { id: 'b', label: 'b' },
        { id: 'c', label: 'c' },
      ]);
      expect(result.edges).toEqual([
        { from: 'a', to: 'b', label: 'e1' },
        { from: 'b', to: 'c', label: 'e2' },
      ]);
    });

    it('handles path without edge labels', () => {
      const payload = { path: ['x', 'y'] };
      const result = pathResultToGraphData(payload);

      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].label).toBeUndefined();
    });

    it('handles empty path', () => {
      const result = pathResultToGraphData({ path: [] });
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
    });

    it('handles null payload', () => {
      const result = pathResultToGraphData(null);
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
    });

    it('handles single-node path', () => {
      const result = pathResultToGraphData({ path: ['only'] });
      expect(result.nodes).toHaveLength(1);
      expect(result.edges).toEqual([]);
    });
  });

  describe('rawGraphToGraphData', () => {
    it('converts node IDs and edges', () => {
      const nodeIds = ['n1', 'n2', 'n3'];
      const edges = [
        { from: 'n1', to: 'n2', label: 'link' },
        { from: 'n2', to: 'n3', label: 'ref' },
      ];

      const result = rawGraphToGraphData(nodeIds, edges);

      expect(result.nodes).toHaveLength(3);
      expect(result.nodes[0]).toEqual({ id: 'n1', label: 'n1' });
      expect(result.edges).toHaveLength(2);
      expect(result.edges[1]).toEqual({ from: 'n2', to: 'n3', label: 'ref' });
    });

    it('handles empty inputs', () => {
      const result = rawGraphToGraphData([], []);
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
    });

    it('handles null inputs', () => {
      const result = rawGraphToGraphData(null, null);
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
    });
  });
});
