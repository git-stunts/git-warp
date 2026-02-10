import { describe, it, expect, vi } from 'vitest';

// Mock elkjs to avoid loading the real 2.5MB engine.
vi.mock('elkjs/lib/elk.bundled.js', () => {
  const mockLayout = vi.fn(async (graph) => ({
    ...graph,
    width: 300,
    height: 150,
    children: (graph.children ?? []).map((/** @type {any} */ c, /** @type {any} */ i) => ({
      ...c,
      x: i * 120,
      y: 10,
    })),
    edges: (graph.edges ?? []).map((/** @type {any} */ e) => ({
      ...e,
      sections: [
        {
          startPoint: { x: 0, y: 0 },
          endPoint: { x: 120, y: 0 },
        },
      ],
    })),
  }));

  return {
    default: class ELK {
      layout = mockLayout;
    },
  };
});

const { layoutGraph } = await import(
  '../../../src/visualization/layouts/index.js'
);

describe('layoutGraph', () => {
  it('runs the full pipeline: graphData -> positionedGraph', async () => {
    const graphData = {
      nodes: [
        { id: 'user:alice', label: 'Alice' },
        { id: 'user:bob', label: 'Bob' },
      ],
      edges: [{ from: 'user:alice', to: 'user:bob', label: 'knows' }],
    };

    const result = await layoutGraph(graphData);

    expect(result).toHaveProperty('nodes');
    expect(result).toHaveProperty('edges');
    expect(result).toHaveProperty('width');
    expect(result).toHaveProperty('height');
  });

  it('returns a PositionedGraph with correct node count', async () => {
    const graphData = {
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ],
      edges: [],
    };

    const result = await layoutGraph(graphData);

    expect(result.nodes).toHaveLength(3);
    expect(result.nodes[0].id).toBe('a');
    expect(result.nodes[0].label).toBe('A');
    expect(typeof result.nodes[0].x).toBe('number');
    expect(typeof result.nodes[0].y).toBe('number');
  });

  it('returns edges with sections from layout engine', async () => {
    const graphData = {
      nodes: [
        { id: 'src', label: 'Source' },
        { id: 'dst', label: 'Dest' },
      ],
      edges: [{ from: 'src', to: 'dst', label: 'link' }],
    };

    const result = await layoutGraph(graphData);

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].source).toBe('src');
    expect(result.edges[0].target).toBe('dst');
    expect(result.edges[0].sections).toHaveLength(1);
  });

  it('accepts layout options', async () => {
    const graphData = {
      nodes: [{ id: 'x', label: 'X' }],
      edges: [],
    };

    const result = await layoutGraph(graphData, { type: 'path' });

    expect(result.nodes).toHaveLength(1);
  });

  it('handles empty graph data', async () => {
    const result = await layoutGraph({ nodes: [], edges: [] });

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});
