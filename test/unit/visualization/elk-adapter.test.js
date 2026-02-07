import { describe, it, expect } from 'vitest';
import { toElkGraph, getDefaultLayoutOptions } from '../../../src/visualization/layouts/elkAdapter.js';

describe('elkAdapter', () => {
  describe('getDefaultLayoutOptions', () => {
    it('returns layered DOWN for query type', () => {
      const opts = getDefaultLayoutOptions('query');
      expect(opts['elk.algorithm']).toBe('layered');
      expect(opts['elk.direction']).toBe('DOWN');
    });

    it('returns layered RIGHT for path type', () => {
      const opts = getDefaultLayoutOptions('path');
      expect(opts['elk.direction']).toBe('RIGHT');
    });

    it('returns layered DOWN for slice type', () => {
      const opts = getDefaultLayoutOptions('slice');
      expect(opts['elk.direction']).toBe('DOWN');
    });

    it('returns default preset for unknown type', () => {
      const opts = getDefaultLayoutOptions('unknown');
      expect(opts['elk.algorithm']).toBe('layered');
    });
  });

  describe('toElkGraph', () => {
    it('produces valid ELK JSON with children and edges', () => {
      const graphData = {
        nodes: [
          { id: 'a', label: 'Alice' },
          { id: 'b', label: 'Bob' },
        ],
        edges: [
          { from: 'a', to: 'b', label: 'knows' },
        ],
      };

      const elk = toElkGraph(graphData, { type: 'query' });

      expect(elk.id).toBe('root');
      expect(elk.layoutOptions['elk.algorithm']).toBe('layered');
      expect(elk.children).toHaveLength(2);
      expect(elk.edges).toHaveLength(1);
    });

    it('sets node dimensions based on label length', () => {
      const graphData = {
        nodes: [{ id: 'x', label: 'short' }],
        edges: [],
      };

      const elk = toElkGraph(graphData);
      // 'short' = 5 chars * 9 + 24 = 69, min is 80
      expect(elk.children[0].width).toBe(80);
      expect(elk.children[0].height).toBe(40);
    });

    it('widens nodes for long labels', () => {
      const graphData = {
        nodes: [{ id: 'x', label: 'a-very-long-node-label' }],
        edges: [],
      };

      const elk = toElkGraph(graphData);
      // 22 chars * 9 + 24 = 222
      expect(elk.children[0].width).toBe(222);
    });

    it('includes edge labels when present', () => {
      const graphData = {
        nodes: [{ id: 'a' }, { id: 'b' }],
        edges: [{ from: 'a', to: 'b', label: 'link' }],
      };

      const elk = toElkGraph(graphData);
      expect(elk.edges[0].labels).toEqual([{ text: 'link' }]);
    });

    it('omits edge labels when absent', () => {
      const graphData = {
        nodes: [{ id: 'a' }, { id: 'b' }],
        edges: [{ from: 'a', to: 'b' }],
      };

      const elk = toElkGraph(graphData);
      expect(elk.edges[0].labels).toBeUndefined();
    });

    it('uses custom layoutOptions when provided', () => {
      const graphData = { nodes: [], edges: [] };
      const custom = { 'elk.algorithm': 'force' };

      const elk = toElkGraph(graphData, { layoutOptions: custom });
      expect(elk.layoutOptions['elk.algorithm']).toBe('force');
    });

    it('handles empty graph data', () => {
      const elk = toElkGraph({ nodes: [], edges: [] });
      expect(elk.children).toEqual([]);
      expect(elk.edges).toEqual([]);
    });
  });
});
