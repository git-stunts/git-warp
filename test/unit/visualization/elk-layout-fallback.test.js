import { describe, it, expect, vi } from 'vitest';

// Mock elkjs to throw on layout(), forcing the fallback path.
vi.mock('elkjs/lib/elk.bundled.js', () => ({
  default: class MockELK {
    async layout() {
      throw new Error('ELK failed');
    }
  },
}));

const { runLayout } = await import(
  '../../../src/visualization/layouts/elkLayout.js'
);

describe('elkLayout fallbackLayout', () => {
  it('falls back when ELK throws', async () => {
    const elkGraph = {
      id: 'root',
      children: [
        { id: 'a', width: 80, height: 40, labels: [{ text: 'A' }] },
      ],
      edges: [],
    };

    const result = await runLayout(elkGraph);

    expect(result).toHaveProperty('nodes');
    expect(result).toHaveProperty('edges');
    expect(result).toHaveProperty('width');
    expect(result).toHaveProperty('height');
    expect(result.nodes).toHaveLength(1);
    expect(/** @type {any} */ (result.nodes[0]).id).toBe('a');
  });

  it('positions nodes horizontally starting at x=20', async () => {
    const elkGraph = {
      id: 'root',
      children: [
        { id: 'n1', width: 80, height: 40, labels: [{ text: 'N1' }] },
        { id: 'n2', width: 100, height: 50, labels: [{ text: 'N2' }] },
      ],
      edges: [],
    };

    const result = await runLayout(elkGraph);

    expect(/** @type {any} */ (result.nodes[0]).x).toBe(20);
    expect(/** @type {any} */ (result.nodes[0]).y).toBe(20);
    // Second node: x = 20 + (80 + 40) = 140
    expect(/** @type {any} */ (result.nodes[1]).x).toBe(140);
    expect(/** @type {any} */ (result.nodes[1]).y).toBe(20);
  });

  it('uses default width=80 and height=40 when not specified', async () => {
    const elkGraph = {
      id: 'root',
      children: [{ id: 'x' }],
      edges: [],
    };

    const result = await runLayout(elkGraph);

    expect(/** @type {any} */ (result.nodes[0]).width).toBe(80);
    expect(/** @type {any} */ (result.nodes[0]).height).toBe(40);
  });

  it('uses node id as label when labels are missing', async () => {
    const elkGraph = {
      id: 'root',
      children: [{ id: 'my-node' }],
      edges: [],
    };

    const result = await runLayout(elkGraph);

    expect(/** @type {any} */ (result.nodes[0]).label).toBe('my-node');
  });

  it('edge sections are always empty arrays', async () => {
    const elkGraph = {
      id: 'root',
      children: [
        { id: 'a', width: 80, height: 40 },
        { id: 'b', width: 80, height: 40 },
      ],
      edges: [
        {
          id: 'e0',
          sources: ['a'],
          targets: ['b'],
          labels: [{ text: 'rel' }],
        },
      ],
    };

    const result = await runLayout(elkGraph);

    expect(result.edges).toHaveLength(1);
    expect(/** @type {any} */ (result.edges[0]).sections).toEqual([]);
    expect(/** @type {any} */ (result.edges[0]).source).toBe('a');
    expect(/** @type {any} */ (result.edges[0]).target).toBe('b');
    expect(/** @type {any} */ (result.edges[0]).label).toBe('rel');
  });

  it('returns total accumulated width and height=80', async () => {
    const elkGraph = {
      id: 'root',
      children: [
        { id: 'a', width: 80, height: 40 },
        { id: 'b', width: 100, height: 40 },
      ],
      edges: [],
    };

    const result = await runLayout(elkGraph);

    // totalWidth = 20 (start) + (80 + 40) + (100 + 40) = 280
    expect(result.width).toBe(280);
    expect(result.height).toBe(80);
  });

  it('handles empty children and edges', async () => {
    const elkGraph = { id: 'root' };

    const result = await runLayout(elkGraph);

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.width).toBe(20);
    expect(result.height).toBe(80);
  });

  it('edge defaults source/target to empty string when missing', async () => {
    const elkGraph = {
      id: 'root',
      children: [],
      edges: [{ id: 'e0' }],
    };

    const result = await runLayout(elkGraph);

    expect(/** @type {any} */ (result.edges[0]).source).toBe('');
    expect(/** @type {any} */ (result.edges[0]).target).toBe('');
    expect(/** @type {any} */ (result.edges[0]).label).toBeUndefined();
  });
});
