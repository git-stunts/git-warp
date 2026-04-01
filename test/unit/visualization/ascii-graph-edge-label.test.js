import { describe, it, expect } from 'vitest';
import { renderGraphView } from '../../../src/visualization/renderers/ascii/graph.js';
import { stripAnsi } from '../../../src/visualization/utils/ansi.js';

describe('ASCII graph renderer edge labels', () => {
  it('renders edge label at midpoint of the edge path', () => {
    // Two nodes side by side with a horizontal edge that has a label.
    // The edge path runs horizontally between them with enough distance
    // for the label to be placed at the midpoint.
    const positionedGraph = {
      nodes: [
        { id: 'a', x: 0, y: 0, width: 80, height: 40, label: 'Left' },
        { id: 'b', x: 300, y: 0, width: 80, height: 40, label: 'Right' },
      ],
      edges: [
        {
          id: 'e0',
          source: 'a',
          target: 'b',
          label: 'knows',
          sections: [
            {
              startPoint: { x: 80, y: 20 },
              endPoint: { x: 300, y: 20 },
            },
          ],
        },
      ],
      width: 420,
      height: 80,
    };

    const output = stripAnsi(renderGraphView(positionedGraph));

    expect(output).toContain('Left');
    expect(output).toContain('Right');
    expect(output).toContain('knows');
  });

  it('renders edge label on a vertical edge path', () => {
    // Two nodes stacked vertically with a vertical edge.
    const positionedGraph = {
      nodes: [
        { id: 'top', x: 0, y: 0, width: 80, height: 40, label: 'Top' },
        { id: 'bot', x: 0, y: 300, width: 80, height: 40, label: 'Bot' },
      ],
      edges: [
        {
          id: 'e0',
          source: 'top',
          target: 'bot',
          label: 'link',
          sections: [
            {
              startPoint: { x: 40, y: 40 },
              endPoint: { x: 40, y: 300 },
            },
          ],
        },
      ],
      width: 120,
      height: 380,
    };

    const output = stripAnsi(renderGraphView(positionedGraph));

    expect(output).toContain('Top');
    expect(output).toContain('Bot');
    expect(output).toContain('link');
  });

  it('truncates edge labels longer than 10 characters', () => {
    const positionedGraph = {
      nodes: [
        { id: 'a', x: 0, y: 0, width: 80, height: 40, label: 'A' },
        { id: 'b', x: 300, y: 0, width: 80, height: 40, label: 'B' },
      ],
      edges: [
        {
          id: 'e0',
          source: 'a',
          target: 'b',
          label: 'a-very-long-edge-label',
          sections: [
            {
              startPoint: { x: 80, y: 20 },
              endPoint: { x: 300, y: 20 },
            },
          ],
        },
      ],
      width: 420,
      height: 80,
    };

    const output = stripAnsi(renderGraphView(positionedGraph));

    // Label should be truncated to 9 chars + ellipsis
    expect(output).toContain('a-very-lo\u2026');
    expect(output).not.toContain('a-very-long-edge-label');
  });

  it('does not render label when edge has no label', () => {
    const positionedGraph = {
      nodes: [
        { id: 'a', x: 0, y: 0, width: 80, height: 40, label: 'A' },
        { id: 'b', x: 300, y: 0, width: 80, height: 40, label: 'B' },
      ],
      edges: [
        {
          id: 'e0',
          source: 'a',
          target: 'b',
          sections: [
            {
              startPoint: { x: 80, y: 20 },
              endPoint: { x: 300, y: 20 },
            },
          ],
        },
      ],
      width: 420,
      height: 80,
    };

    const output = stripAnsi(renderGraphView(positionedGraph));

    // Should still render the nodes but no stray label text
    expect(output).toContain('A');
    expect(output).toContain('B');
  });

  it('renders label on edge with bend points', () => {
    const positionedGraph = {
      nodes: [
        { id: 'a', x: 0, y: 0, width: 80, height: 40, label: 'Src' },
        { id: 'b', x: 200, y: 200, width: 80, height: 40, label: 'Dst' },
      ],
      edges: [
        {
          id: 'e0',
          source: 'a',
          target: 'b',
          label: 'path',
          sections: [
            {
              startPoint: { x: 40, y: 40 },
              bendPoints: [
                { x: 40, y: 120 },
                { x: 240, y: 120 },
              ],
              endPoint: { x: 240, y: 200 },
            },
          ],
        },
      ],
      width: 320,
      height: 280,
    };

    const output = stripAnsi(renderGraphView(positionedGraph));

    expect(output).toContain('Src');
    expect(output).toContain('Dst');
    expect(output).toContain('path');
  });
});
