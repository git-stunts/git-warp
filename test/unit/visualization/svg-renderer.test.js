import { describe, it, expect } from 'vitest';
import { renderSvg } from '../../../src/visualization/renderers/svg/index.js';

describe('SVG renderer', () => {
  const twoNodeGraph = {
    nodes: [
      { id: 'a', x: 0, y: 0, width: 80, height: 40, label: 'Alice' },
      { id: 'b', x: 0, y: 100, width: 80, height: 40, label: 'Bob' },
    ],
    edges: [{
      id: 'e0', source: 'a', target: 'b', label: 'knows',
      sections: [{
        startPoint: { x: 40, y: 40 },
        endPoint: { x: 40, y: 100 },
      }],
    }],
    width: 200,
    height: 200,
  };

  it('produces valid SVG wrapper', () => {
    const svg = renderSvg(twoNodeGraph);
    expect(svg).toMatch(/^<svg\s/);
    expect(svg).toContain('</svg>');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('includes correct number of nodes', () => {
    const svg = renderSvg(twoNodeGraph);
    const nodeCount = (svg.match(/<g class="node">/g) || []).length;
    expect(nodeCount).toBe(2);
  });

  it('includes correct number of edges', () => {
    const svg = renderSvg(twoNodeGraph);
    const edgeCount = (svg.match(/<g class="edge">/g) || []).length;
    expect(edgeCount).toBe(1);
  });

  it('renders node labels', () => {
    const svg = renderSvg(twoNodeGraph);
    expect(svg).toContain('Alice');
    expect(svg).toContain('Bob');
  });

  it('renders edge labels', () => {
    const svg = renderSvg(twoNodeGraph);
    expect(svg).toContain('knows');
  });

  it('includes arrowhead marker', () => {
    const svg = renderSvg(twoNodeGraph);
    expect(svg).toContain('marker id="arrowhead"');
  });

  it('includes title when provided', () => {
    const svg = renderSvg(twoNodeGraph, { title: 'My Graph' });
    expect(svg).toContain('<title>My Graph</title>');
  });

  it('escapes XML special characters in labels', () => {
    const graph = {
      nodes: [{ id: 'x', x: 0, y: 0, width: 80, height: 40, label: '<b>&"test"</b>' }],
      edges: [],
      width: 100,
      height: 60,
    };
    const svg = renderSvg(graph);
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('&lt;b&gt;');
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&quot;');
  });

  it('handles empty graph', () => {
    const svg = renderSvg({ nodes: [], edges: [], width: 0, height: 0 });
    expect(svg).toMatch(/^<svg\s/);
    expect(svg).toContain('</svg>');
  });

  it('renders edges without sections as empty', () => {
    const graph = {
      nodes: [
        { id: 'a', x: 0, y: 0, width: 80, height: 40, label: 'A' },
        { id: 'b', x: 100, y: 0, width: 80, height: 40, label: 'B' },
      ],
      edges: [{ id: 'e0', source: 'a', target: 'b', sections: [] }],
      width: 200,
      height: 60,
    };
    const svg = renderSvg(graph);
    // No edge group rendered for edges without sections
    expect((svg.match(/<g class="edge">/g) || []).length).toBe(0);
  });

  it('snapshot test for full SVG output', () => {
    const svg = renderSvg(twoNodeGraph, { title: 'Snapshot Test' });
    expect(svg).toMatchSnapshot();
  });
});
