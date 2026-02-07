import { describe, it, expect } from 'vitest';
import { renderGraphView } from '../../../src/visualization/renderers/ascii/graph.js';
import { stripAnsi } from '../../../src/visualization/utils/ansi.js';

describe('ASCII graph renderer', () => {
  it('renders a single node', () => {
    const positioned = {
      nodes: [{ id: 'a', x: 0, y: 0, width: 80, height: 40, label: 'NodeA' }],
      edges: [],
      width: 120,
      height: 80,
    };

    const output = stripAnsi(renderGraphView(positioned));
    expect(output).toContain('NodeA');
    expect(output).toContain('\u250C'); // ┌
    expect(output).toContain('\u2518'); // ┘
    expect(output).toMatchSnapshot();
  });

  it('renders a 3-node DAG with edges', () => {
    const positioned = {
      nodes: [
        { id: 'a', x: 80, y: 0, width: 80, height: 40, label: 'Alpha' },
        { id: 'b', x: 0, y: 120, width: 80, height: 40, label: 'Beta' },
        { id: 'c', x: 160, y: 120, width: 80, height: 40, label: 'Gamma' },
      ],
      edges: [
        {
          id: 'e0', source: 'a', target: 'b', label: undefined,
          sections: [{
            startPoint: { x: 100, y: 40 },
            endPoint: { x: 40, y: 120 },
            bendPoints: [{ x: 100, y: 80 }, { x: 40, y: 80 }],
          }],
        },
        {
          id: 'e1', source: 'a', target: 'c', label: undefined,
          sections: [{
            startPoint: { x: 140, y: 40 },
            endPoint: { x: 200, y: 120 },
            bendPoints: [{ x: 140, y: 80 }, { x: 200, y: 80 }],
          }],
        },
      ],
      width: 280,
      height: 200,
    };

    const output = stripAnsi(renderGraphView(positioned, { title: 'TEST DAG' }));
    expect(output).toContain('Alpha');
    expect(output).toContain('Beta');
    expect(output).toContain('Gamma');
    expect(output).toContain('TEST DAG');
    expect(output).toMatchSnapshot();
  });

  it('renders an empty graph', () => {
    const positioned = { nodes: [], edges: [], width: 0, height: 0 };
    const output = stripAnsi(renderGraphView(positioned));
    expect(output).toContain('empty graph');
  });

  it('handles disconnected nodes', () => {
    const positioned = {
      nodes: [
        { id: 'x', x: 0, y: 0, width: 80, height: 40, label: 'Alone1' },
        { id: 'y', x: 120, y: 0, width: 80, height: 40, label: 'Alone2' },
      ],
      edges: [],
      width: 240,
      height: 80,
    };

    const output = stripAnsi(renderGraphView(positioned));
    expect(output).toContain('Alone1');
    expect(output).toContain('Alone2');
    expect(output).toMatchSnapshot();
  });

  it('truncates long labels', () => {
    const positioned = {
      nodes: [{
        id: 'long', x: 0, y: 0, width: 80, height: 40,
        label: 'this-is-a-very-long-node-label-that-should-truncate',
      }],
      edges: [],
      width: 120,
      height: 80,
    };

    const output = stripAnsi(renderGraphView(positioned));
    // Should contain truncation character
    expect(output).toContain('\u2026'); // …
    expect(output).toMatchSnapshot();
  });
});
