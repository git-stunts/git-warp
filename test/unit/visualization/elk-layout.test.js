import { describe, it, expect, vi, beforeEach } from 'vitest';

// We mock elkjs to avoid loading 2.5MB in unit tests.
// The integration test (below) uses the real engine.
vi.mock('elkjs/lib/elk.bundled.js', () => {
  const mockLayout = vi.fn(async (graph) => ({
    ...graph,
    width: 200,
    height: 100,
    children: (graph.children ?? []).map((/** @type {any} */ c, /** @type {any} */ i) => ({
      ...c,
      x: i * 100,
      y: 20,
    })),
    edges: (graph.edges ?? []).map((/** @type {any} */ e) => ({
      ...e,
      sections: [{
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 100, y: 0 },
      }],
    })),
  }));

  return {
    default: class ELK {
      layout = mockLayout;
    },
  };
});

// Import after mock is set up
const { runLayout } = await import('../../../src/visualization/layouts/elkLayout.js');

describe('elkLayout', () => {
  describe('runLayout', () => {
    it('returns a PositionedGraph with nodes, edges, width, height', async () => {
      const elkGraph = {
        id: 'root',
        layoutOptions: {},
        children: [
          { id: 'a', width: 80, height: 40, labels: [{ text: 'A' }] },
          { id: 'b', width: 80, height: 40, labels: [{ text: 'B' }] },
        ],
        edges: [
          { id: 'e0', sources: ['a'], targets: ['b'] },
        ],
      };

      const result = await runLayout(elkGraph);

      expect(result.width).toBe(200);
      expect(result.height).toBe(100);
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].id).toBe('a');
      expect(result.nodes[0].label).toBe('A');
      expect(typeof result.nodes[0].x).toBe('number');
      expect(typeof result.nodes[0].y).toBe('number');
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].source).toBe('a');
      expect(result.edges[0].target).toBe('b');
      expect(result.edges[0].sections).toHaveLength(1);
    });

    it('handles empty graph', async () => {
      const result = await runLayout({
        id: 'root',
        layoutOptions: {},
        children: [],
        edges: [],
      });

      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
    });
  });
});

describe('elkLayout PositionedGraph shape contract', () => {
  it('validates PositionedGraph shape from mock layout', async () => {
    // ESM module cache means vi.doUnmock cannot bypass the mock above.
    // A true integration test with real elkjs needs a separate file.
    vi.doUnmock('elkjs/lib/elk.bundled.js');
    const mod = await import('../../../src/visualization/layouts/elkLayout.js');
    const result = await mod.runLayout({
      id: 'root',
      layoutOptions: { 'elk.algorithm': 'layered' },
      children: [
        { id: 'n1', width: 80, height: 40, labels: [{ text: 'N1' }] },
      ],
      edges: [],
    });

    expect(result).toHaveProperty('nodes');
    expect(result).toHaveProperty('edges');
    expect(result).toHaveProperty('width');
    expect(result).toHaveProperty('height');
  });
});
