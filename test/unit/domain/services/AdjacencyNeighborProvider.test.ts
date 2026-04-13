import { describe, it, expect } from 'vitest';
import AdjacencyNeighborProvider from '../../../../src/domain/services/query/AdjacencyNeighborProvider.js';

/**
 * Helper: build adjacency maps from a list of edges.
 * Each edge: { from, to, label }
 */
/** @param {Array<{from: string, to: string, label: string}>} edges */
function buildMaps(edges: Array<{from: string; to: string; label: string}>) {
  const outgoing = new Map<string, any[]>();
  const incoming = new Map<string, any[]>();
  const allNodes = new Set<string>();

  for (const { from, to, label } of edges) {
    allNodes.add(from);
    allNodes.add(to);
    if (!outgoing.has(from)) outgoing.set(from, []);
    outgoing.get(from)!.push({ neighborId: to, label });
    if (!incoming.has(to)) incoming.set(to, []);
    incoming.get(to)!.push({ neighborId: from, label });
  }
  return { outgoing, incoming, aliveNodes: allNodes };
}

describe('AdjacencyNeighborProvider', () => {
  const edges = [
    { from: 'a', to: 'b', label: 'knows' },
    { from: 'a', to: 'c', label: 'manages' },
    { from: 'a', to: 'c', label: 'knows' },
    { from: 'b', to: 'c', label: 'knows' },
  ];
  const { outgoing, incoming, aliveNodes } = buildMaps(edges);

  it('returns outgoing neighbors sorted by (neighborId, label)', async () => {
    const provider = new AdjacencyNeighborProvider({ outgoing, incoming, aliveNodes });
    const result = await provider.getNeighbors('a', 'out');
    expect(result).toEqual([
      { neighborId: 'b', label: 'knows' },
      { neighborId: 'c', label: 'knows' },
      { neighborId: 'c', label: 'manages' },
    ]);
  });

  it('returns incoming neighbors sorted', async () => {
    const provider = new AdjacencyNeighborProvider({ outgoing, incoming, aliveNodes });
    const result = await provider.getNeighbors('c', 'in');
    expect(result).toEqual([
      { neighborId: 'a', label: 'knows' },
      { neighborId: 'a', label: 'manages' },
      { neighborId: 'b', label: 'knows' },
    ]);
  });

  it('returns merged "both" with dedup by (neighborId, label)', async () => {
    // a→b:knows and b→a would have 'a' in both in-list and out-list
    const edges2 = [
      { from: 'a', to: 'b', label: 'x' },
      { from: 'b', to: 'a', label: 'x' },
    ];
    const maps = buildMaps(edges2);
    const provider = new AdjacencyNeighborProvider(maps);

    // From 'a': out=[b:x], in=[b:x] → merged+dedup=[b:x]
    const result = await provider.getNeighbors('a', 'both');
    expect(result).toEqual([{ neighborId: 'b', label: 'x' }]);
  });

  it('filters by labels', async () => {
    const provider = new AdjacencyNeighborProvider({ outgoing, incoming, aliveNodes });
    const result = await provider.getNeighbors('a', 'out', { labels: new Set(['manages']) });
    expect(result).toEqual([{ neighborId: 'c', label: 'manages' }]);
  });

  it('returns empty for unknown label filter', async () => {
    const provider = new AdjacencyNeighborProvider({ outgoing, incoming, aliveNodes });
    const result = await provider.getNeighbors('a', 'out', { labels: new Set(['nonexistent']) });
    expect(result).toEqual([]);
  });

  it('returns empty for unknown node', async () => {
    const provider = new AdjacencyNeighborProvider({ outgoing, incoming, aliveNodes });
    const result = await provider.getNeighbors('unknown', 'out');
    expect(result).toEqual([]);
  });

  it('hasNode returns true for alive nodes', async () => {
    const provider = new AdjacencyNeighborProvider({ outgoing, incoming, aliveNodes });
    expect(await provider.hasNode('a')).toBe(true);
    expect(await provider.hasNode('z')).toBe(false);
  });

  it('throws when aliveNodes is omitted', () => {
    expect(() => new AdjacencyNeighborProvider(({ outgoing, incoming } as any))).toThrow(
      /aliveNodes is required/i,
    );
  });

  it('latencyClass is sync', () => {
    const provider = new AdjacencyNeighborProvider({ outgoing, incoming, aliveNodes });
    expect(provider.latencyClass).toBe('sync');
  });

  it('multi-label union for "both" keeps separate label entries', async () => {
    const edges3 = [
      { from: 'x', to: 'y', label: 'a' },
      { from: 'y', to: 'x', label: 'b' },
    ];
    const maps = buildMaps(edges3);
    const provider = new AdjacencyNeighborProvider(maps);

    // From 'x': out=[y:a], in=[y:b] → merged=[y:a, y:b] (different labels)
    const result = await provider.getNeighbors('x', 'both');
    expect(result).toEqual([
      { neighborId: 'y', label: 'a' },
      { neighborId: 'y', label: 'b' },
    ]);
  });

  // M9 regression: sortAdjacencyMap must not mutate caller's data in-place
  describe('M9 — no in-place mutation of caller data', () => {
    it('does not mutate the original outgoing/incoming arrays', () => {
      const outgoing = new Map([
        ['a', [
          { neighborId: 'c', label: 'manages' },
          { neighborId: 'b', label: 'knows' },
        ]],
      ]);
      const incoming = new Map([
        ['b', [{ neighborId: 'a', label: 'knows' }]],
        ['c', [{ neighborId: 'a', label: 'manages' }]],
      ]);

      // Snapshot the original order before construction
      const outA = outgoing.get('a');
      if (!outA) { throw new Error('expected outA'); }
      const originalOutA = outA.map((e) => ({ ...e }));

      // Construction triggers sortAdjacencyMap internally
      new AdjacencyNeighborProvider({ outgoing, incoming, aliveNodes: new Set(['a', 'b', 'c']) });

      // Caller's original arrays must be unmodified
      expect(outgoing.get('a')).toEqual(originalOutA);
      // Specifically: 'c' was first in the original, if sorted in-place 'b' would be first
      const firstOut = outA[0];
      expect(firstOut).toBeDefined();
      expect(firstOut?.neighborId).toBe('c');
    });

    it('two providers from same source data are independent', async () => {
      const edges1 = [
        { from: 'x', to: 'z', label: 'b' },
        { from: 'x', to: 'y', label: 'a' },
      ];
      const maps = buildMaps(edges1);

      const p1 = new AdjacencyNeighborProvider(maps);
      const p2 = new AdjacencyNeighborProvider(maps);

      // Both should return sorted results independently
      const r1 = await p1.getNeighbors('x', 'out');
      const r2 = await p2.getNeighbors('x', 'out');
      expect(r1).toEqual([
        { neighborId: 'y', label: 'a' },
        { neighborId: 'z', label: 'b' },
      ]);
      expect(r2).toEqual(r1);
    });
  });
});
