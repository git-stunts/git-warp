import { describe, it, expect } from 'vitest';
import GraphTraversal from '../../../../src/domain/services/query/GraphTraversal.ts';
import AdjacencyNeighborProvider from '../../../../src/domain/services/query/AdjacencyNeighborProvider.js';

/**
 * Helper: build adjacency maps + provider from edge list.
 * Each edge: { from, to, label? }
 */
/** @param {Array<{from: string, to: string, label?: string}>} edges */
function buildProvider(edges: Array<{from: string; to: string; label?: string}>) {
  const outgoing = new Map();
  const incoming = new Map();
  const allNodes = new Set<string>();

  for (const { from, to, label = '' } of edges) {
    allNodes.add(from);
    allNodes.add(to);
    if (!outgoing.has(from)) { outgoing.set(from, []); }
    outgoing.get(from).push({ neighborId: to, label });
    if (!incoming.has(to)) { incoming.set(to, []); }
    incoming.get(to).push({ neighborId: from, label });
  }
  return new AdjacencyNeighborProvider({ outgoing, incoming, aliveNodes: allNodes });
}

/**
 * Simple diamond graph:
 *       a
 *      / \
 *     b   c
 *      \ /
 *       d
 */
function diamondProvider() {
  return buildProvider([
    { from: 'a', to: 'b' },
    { from: 'a', to: 'c' },
    { from: 'b', to: 'd' },
    { from: 'c', to: 'd' },
  ]);
}

/**
 * Linear chain: a → b → c → d → e
 */
function chainProvider() {
  return buildProvider([
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
    { from: 'c', to: 'd' },
    { from: 'd', to: 'e' },
  ]);
}

/**
 * Labeled graph:
 *   a --knows--> b
 *   a --manages--> c
 *   b --knows--> c
 */
function labeledProvider() {
  return buildProvider([
    { from: 'a', to: 'b', label: 'knows' },
    { from: 'a', to: 'c', label: 'manages' },
    { from: 'b', to: 'c', label: 'knows' },
  ]);
}

// ==== BFS Tests ====

describe('GraphTraversal.bfs', () => {
  it('visits diamond in deterministic lex order', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const { nodes } = await engine.bfs({ start: 'a' });
    expect(nodes).toEqual(['a', 'b', 'c', 'd']);
  });

  it('visits chain in order', async () => {
    const engine = new GraphTraversal({ provider: chainProvider() });
    const { nodes } = await engine.bfs({ start: 'a' });
    expect(nodes).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('respects maxDepth', async () => {
    const engine = new GraphTraversal({ provider: chainProvider() });
    const { nodes } = await engine.bfs({ start: 'a', maxDepth: 2 });
    expect(nodes).toEqual(['a', 'b', 'c']);
  });

  it('respects maxNodes', async () => {
    const engine = new GraphTraversal({ provider: chainProvider() });
    const { nodes } = await engine.bfs({ start: 'a', maxNodes: 3 });
    expect(nodes).toEqual(['a', 'b', 'c']);
  });

  it('breaks mid-level once maxNodes is reached', async () => {
    const provider = buildProvider([
      { from: 'root', to: 'c' },
      { from: 'root', to: 'a' },
      { from: 'root', to: 'b' },
    ]);
    const engine = new GraphTraversal({ provider });
    const { nodes } = await engine.bfs({ start: 'root', maxNodes: 2 });
    expect(nodes).toEqual(['root', 'a']);
  });

  it('skips nodes deeper than maxDepth before visit', async () => {
    const engine = new GraphTraversal({ provider: chainProvider() });
    const { nodes, stats } = await engine.bfs({ start: 'a', maxDepth: -1 });
    expect(nodes).toEqual([]);
    expect(stats.nodesVisited).toBe(0);
  });

  it('follows "in" direction', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const { nodes } = await engine.bfs({ start: 'd', direction: 'in' });
    expect(nodes).toEqual(['d', 'b', 'c', 'a']);
  });

  it('follows "both" direction', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const { nodes } = await engine.bfs({ start: 'b', direction: 'both' });
    expect(nodes).toEqual(['b', 'a', 'd', 'c']);
  });

  it('filters by labels', async () => {
    const engine = new GraphTraversal({ provider: labeledProvider() });
    const { nodes } = await engine.bfs({ start: 'a', options: { labels: new Set(['manages']) } });
    expect(nodes).toEqual(['a', 'c']);
  });

  it('returns stats', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const { stats } = await engine.bfs({ start: 'a' });
    expect(stats.nodesVisited).toBe(4);
    expect(stats.edgesTraversed).toBeGreaterThan(0);
  });

  it('deterministic order with many same-depth nodes', async () => {
    // Star graph: center → a, b, c, d, e (all at depth 1)
    const provider = buildProvider([
      { from: 'center', to: 'e' },
      { from: 'center', to: 'c' },
      { from: 'center', to: 'a' },
      { from: 'center', to: 'd' },
      { from: 'center', to: 'b' },
    ]);
    const engine = new GraphTraversal({ provider });
    const { nodes } = await engine.bfs({ start: 'center' });
    expect(nodes).toEqual(['center', 'a', 'b', 'c', 'd', 'e']);
  });

  it('handles AbortSignal', async () => {
    const ac = new AbortController();
    ac.abort();
    const engine = new GraphTraversal({ provider: chainProvider() });
    await expect(engine.bfs({ start: 'a', signal: ac.signal })).rejects.toThrow(/aborted/i);
  });
});

// ==== DFS Tests ====

describe('GraphTraversal.dfs', () => {
  it('visits diamond left-first (lex order)', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const { nodes } = await engine.dfs({ start: 'a' });
    // a → b (lex first) → d → c (already visited via d? no, c not from b)
    // Actually: a's neighbors are b and c. Push c first, then b (reverse).
    // Pop b → b's neighbors: d. Push d. Pop d. Pop c (c has neighbor d but visited).
    expect(nodes).toEqual(['a', 'b', 'd', 'c']);
  });

  it('visits chain in order', async () => {
    const engine = new GraphTraversal({ provider: chainProvider() });
    const { nodes } = await engine.dfs({ start: 'a' });
    expect(nodes).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('respects maxDepth', async () => {
    const engine = new GraphTraversal({ provider: chainProvider() });
    const { nodes } = await engine.dfs({ start: 'a', maxDepth: 2 });
    expect(nodes).toEqual(['a', 'b', 'c']);
  });

  it('leftmost-first via reverse-push', async () => {
    // a → d, a → c, a → b (sorted: a→b, a→c, a→d)
    // Push reverse: d, c, b. Pop b first.
    const provider = buildProvider([
      { from: 'a', to: 'd' },
      { from: 'a', to: 'c' },
      { from: 'a', to: 'b' },
    ]);
    const engine = new GraphTraversal({ provider });
    const { nodes } = await engine.dfs({ start: 'a' });
    expect(nodes).toEqual(['a', 'b', 'c', 'd']);
  });

  it('skips duplicate stack entries once a node is visited', async () => {
    const provider = buildProvider([
      { from: 'a', to: 'b' },
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ]);
    const engine = new GraphTraversal({ provider });
    const { nodes } = await engine.dfs({ start: 'a' });
    expect(nodes).toEqual(['a', 'b', 'c']);
  });

  it('skips nodes deeper than maxDepth before visit', async () => {
    const engine = new GraphTraversal({ provider: chainProvider() });
    const { nodes, stats } = await engine.dfs({ start: 'a', maxDepth: -1 });
    expect(nodes).toEqual([]);
    expect(stats.nodesVisited).toBe(0);
  });

  it('calls DFS hooks for visits and expansions', async () => {
    /** @type {Array<{nodeId: string, depth: number}>} */
    const visited: any[] = [];
    /** @type {Array<{nodeId: string, count: number}>} */
    const expanded: any[] = [];
    const engine = new GraphTraversal({ provider: diamondProvider() });
    await engine.dfs({
      start: 'a',
      hooks: {
        onVisit: (nodeId, depth) => visited.push({ nodeId, depth }),
        onExpand: (nodeId, neighbors) => expanded.push({ nodeId, count: neighbors.length }),
      },
    });

    expect(visited.map(({ nodeId }) => nodeId)).toEqual(['a', 'b', 'd', 'c']);
    expect(expanded).toContainEqual({ nodeId: 'a', count: 2 });
  });
});

// ==== shortestPath Tests ====

describe('GraphTraversal.shortestPath', () => {
  it('finds shortest path in diamond', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const result = await engine.shortestPath({ start: 'a', goal: 'd' });
    expect(result.found).toBe(true);
    expect(result.length).toBe(2);
    // Both a→b→d and a→c→d are length 2. BFS-lex picks a→b→d (b < c)
    expect(result.path).toEqual(['a', 'b', 'd']);
  });

  it('returns self for start === goal', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const result = await engine.shortestPath({ start: 'a', goal: 'a' });
    expect(result.found).toBe(true);
    expect(result.path).toEqual(['a']);
    expect(result.length).toBe(0);
  });

  it('returns not found for unreachable', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const result = await engine.shortestPath({ start: 'd', goal: 'a' });
    expect(result.found).toBe(false);
    expect(result.length).toBe(-1);
  });

  it('finds path in chain', async () => {
    const engine = new GraphTraversal({ provider: chainProvider() });
    const result = await engine.shortestPath({ start: 'a', goal: 'e' });
    expect(result.found).toBe(true);
    expect(result.path).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(result.length).toBe(4);
  });

  it('skips duplicate neighbors already marked visited', async () => {
    const provider = buildProvider([
      { from: 'a', to: 'b' },
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ]);
    const engine = new GraphTraversal({ provider });
    const result = await engine.shortestPath({ start: 'a', goal: 'c' });
    expect(result.path).toEqual(['a', 'b', 'c']);
    expect(result.length).toBe(2);
  });

  it('returns not found when maxDepth blocks all expansion', async () => {
    const engine = new GraphTraversal({ provider: chainProvider() });
    const result = await engine.shortestPath({ start: 'a', goal: 'b', maxDepth: 0 });
    expect(result.found).toBe(false);
    expect(result.path).toEqual([]);
  });

  it('checks AbortSignal every thousand visited nodes', async () => {
    const edges: any[] = [];
    for (let i = 0; i < 999; i += 1) {
      edges.push({ from: 'root', to: `n${String(i).padStart(3, '0')}` });
    }
    const ac = new AbortController();
    ac.abort();
    const engine = new GraphTraversal({ provider: buildProvider(edges) });

    await expect(
      engine.shortestPath({ start: 'root', goal: 'never', signal: ac.signal }),
    ).rejects.toThrow(/aborted/i);
  });
});

// ==== isReachable Tests ====

describe('GraphTraversal.isReachable', () => {
  it('returns true for reachable nodes', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const { reachable } = await engine.isReachable({ start: 'a', goal: 'd' });
    expect(reachable).toBe(true);
  });

  it('returns true for self', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const { reachable } = await engine.isReachable({ start: 'a', goal: 'a' });
    expect(reachable).toBe(true);
  });

  it('returns false for unreachable', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const { reachable } = await engine.isReachable({ start: 'd', goal: 'a' });
    expect(reachable).toBe(false);
  });

  it('checks AbortSignal every thousand visited nodes', async () => {
    const edges: any[] = [];
    for (let i = 0; i < 999; i += 1) {
      edges.push({ from: 'root', to: `n${String(i).padStart(3, '0')}` });
    }
    const ac = new AbortController();
    ac.abort();
    const engine = new GraphTraversal({ provider: buildProvider(edges) });

    await expect(
      engine.isReachable({ start: 'root', goal: 'never', signal: ac.signal }),
    ).rejects.toThrow(/aborted/i);
  });
});

// ==== weightedShortestPath (Dijkstra) Tests ====

describe('GraphTraversal.weightedShortestPath', () => {
  it('finds shortest weighted path', async () => {
    // a→b (weight 1), a→c (weight 5), b→d (weight 1), c→d (weight 1)
    // Shortest: a→b→d = 2
    const provider = diamondProvider();
    const weights = new Map([
      ['a\0b', 1], ['a\0c', 5], ['b\0d', 1], ['c\0d', 1],
    ]);
    const engine = new GraphTraversal({ provider });
    const result = await engine.weightedShortestPath({
      start: 'a',
      goal: 'd',
      weightFn: (from, to) => weights.get(`${from}\0${to}`) ?? 1,
    });
    expect(result.path).toEqual(['a', 'b', 'd']);
    expect(result.totalCost).toBe(2);
  });

  it('throws NO_PATH for unreachable', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    await expect(
      engine.weightedShortestPath({ start: 'd', goal: 'a' })
    ).rejects.toThrow(/NO_PATH|No path/);
  });

  it('tie-breaks by lexicographic predecessor', async () => {
    // Two equal-cost paths: a→b→d and a→c→d, all weight 1
    // Equal cost = 2. Tie-break: predecessor of d should be b (b < c)
    const provider = diamondProvider();
    const engine = new GraphTraversal({ provider });
    const result = await engine.weightedShortestPath({
      start: 'a', goal: 'd',
    });
    expect(result.path).toEqual(['a', 'b', 'd']);
    expect(result.totalCost).toBe(2);
  });

  it('skips stale heap entries and already visited neighbors', async () => {
    const provider = buildProvider([
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
      { from: 'c', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'b', to: 'd' },
      { from: 'c', to: 'd' },
    ]);
    const weights = new Map([
      ['a\0b', 5],
      ['a\0c', 1],
      ['c\0b', 1],
      ['b\0c', 1],
      ['b\0d', 1],
      ['c\0d', 10],
    ]);
    const engine = new GraphTraversal({ provider });
    const result = await engine.weightedShortestPath({
      start: 'a',
      goal: 'd',
      weightFn: (from, to) => weights.get(`${from}\0${to}`) ?? 1,
    });

    expect(result.path).toEqual(['a', 'c', 'b', 'd']);
    expect(result.totalCost).toBe(3);
  });
});

// ==== A* Tests ====

describe('GraphTraversal.aStarSearch', () => {
  it('finds path with trivial heuristic', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const result = await engine.aStarSearch({
      start: 'a',
      goal: 'd',
    });
    expect(result.path).toEqual(['a', 'b', 'd']);
    expect(result.totalCost).toBe(2);
  });

  it('uses heuristic to guide search', async () => {
    const engine = new GraphTraversal({ provider: chainProvider() });
    // Heuristic: distance to 'e' (simple char distance)
    const result = await engine.aStarSearch({
      start: 'a',
      goal: 'e',
      heuristicFn: (nodeId) => 'e'.charCodeAt(0) - nodeId.charCodeAt(0),
    });
    expect(result.path).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(result.totalCost).toBe(4);
  });

  it('throws NO_PATH for unreachable', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    await expect(
      engine.aStarSearch({ start: 'd', goal: 'a' })
    ).rejects.toThrow(/NO_PATH|No path/);
  });

  it('skips stale heap entries and already visited neighbors', async () => {
    const provider = buildProvider([
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
      { from: 'c', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'b', to: 'd' },
      { from: 'c', to: 'd' },
    ]);
    const weights = new Map([
      ['a\0b', 5],
      ['a\0c', 1],
      ['c\0b', 1],
      ['b\0c', 1],
      ['b\0d', 1],
      ['c\0d', 10],
    ]);
    const engine = new GraphTraversal({ provider });
    const result = await engine.aStarSearch({
      start: 'a',
      goal: 'd',
      heuristicFn: () => 0,
      weightFn: (from, to) => weights.get(`${from}\0${to}`) ?? 1,
    });

    expect(result.path).toEqual(['a', 'c', 'b', 'd']);
    expect(result.totalCost).toBe(3);
  });
});

// ==== bidirectionalAStar Tests ====

describe('GraphTraversal.bidirectionalAStar', () => {
  it('finds path from both directions', async () => {
    const engine = new GraphTraversal({ provider: chainProvider() });
    const result = await engine.bidirectionalAStar({
      start: 'a', goal: 'e',
    });
    expect(result.path).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(result.totalCost).toBe(4);
  });

  it('handles start === goal', async () => {
    const engine = new GraphTraversal({ provider: chainProvider() });
    const result = await engine.bidirectionalAStar({
      start: 'c', goal: 'c',
    });
    expect(result.path).toEqual(['c']);
    expect(result.totalCost).toBe(0);
  });

  it('throws NO_PATH for unreachable', async () => {
    // d has no outgoing in diamond, can't reach a
    const provider = buildProvider([
      { from: 'x', to: 'y' },
      { from: 'p', to: 'q' },
    ]);
    const engine = new GraphTraversal({ provider });
    await expect(
      engine.bidirectionalAStar({ start: 'x', goal: 'p' })
    ).rejects.toThrow(/NO_PATH|No path/);
  });

  it('finds path in diamond', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const result = await engine.bidirectionalAStar({
      start: 'a', goal: 'd',
    });
    expect(result.path[0]).toBe('a');
    expect(result.path[result.path.length - 1]).toBe('d');
    expect(result.totalCost).toBe(2);
  });

  it('respects asymmetric weight function in backward expansion', async () => {
    // Graph: a → b → c  with asymmetric weights
    // Forward: a→b costs 1, b→c costs 1
    // Backward expansion sees edges as c←b, b←a but must call weightFn(b,c) and weightFn(a,b)
    const provider = buildProvider([
      { from: 'a', to: 'b', label: 'e1' },
      { from: 'b', to: 'c', label: 'e2' },
    ]);
    const engine = new GraphTraversal({ provider });

        const weights = ({ 'a|b': 10, 'b|a': 999, 'b|c': 5, 'c|b': 999 }) as Record<string, number>;
    const weightFn = (/** @type {string} */ from, /** @type {string} */ to) => weights[`${from}|${to}`] ?? 1;

    const result = await engine.bidirectionalAStar({
      start: 'a',
      goal: 'c',
      weightFn,
    });
    // Correct cost: a→b (10) + b→c (5) = 15
    // Bug would call weightFn(b,a) and weightFn(c,b) for backward, getting 999
    expect(result.totalCost).toBe(15);
    expect(result.path).toEqual(['a', 'b', 'c']);
  });
});

// ==== connectedComponent Tests ====

describe('GraphTraversal.connectedComponent', () => {
  it('finds all nodes in connected component', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const { nodes } = await engine.connectedComponent({ start: 'd' });
    expect(nodes.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns all nodes reachable via undirected edges', async () => {
    const provider = buildProvider([{ from: 'x', to: 'y' }]);
    const engine = new GraphTraversal({ provider });
    const { nodes } = await engine.connectedComponent({ start: 'x' });
    expect(nodes.sort()).toEqual(['x', 'y']);
  });
});

// ==== topologicalSort Tests ====

describe('GraphTraversal.topologicalSort', () => {
  it('sorts diamond deterministically', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const { sorted, hasCycle } = await engine.topologicalSort({ start: 'a' });
    expect(hasCycle).toBe(false);
    // a must come first, d last. b and c in lex order between.
    expect(sorted).toEqual(['a', 'b', 'c', 'd']);
  });

  it('sorts chain', async () => {
    const engine = new GraphTraversal({ provider: chainProvider() });
    const { sorted, hasCycle } = await engine.topologicalSort({ start: 'a' });
    expect(hasCycle).toBe(false);
    expect(sorted).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('detects cycle without throwing', async () => {
    const provider = buildProvider([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' },
    ]);
    const engine = new GraphTraversal({ provider });
    const { sorted, hasCycle } = await engine.topologicalSort({ start: 'a' });
    expect(hasCycle).toBe(true);
    expect(sorted.length).toBeLessThan(3);
  });

  it('throws on cycle when throwOnCycle=true', async () => {
    const provider = buildProvider([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' },
    ]);
    const engine = new GraphTraversal({ provider });
    await expect(
      engine.topologicalSort({ start: 'a', throwOnCycle: true })
    ).rejects.toThrow(/cycle/i);
  });

  it('provides cycle witness', async () => {
    const provider = buildProvider([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' },
    ]);
    const engine = new GraphTraversal({ provider });
    try {
      await engine.topologicalSort({ start: 'a', throwOnCycle: true });
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as any).code).toBe('ERR_GRAPH_HAS_CYCLES');
      expect((err as any).context.cycleWitness).toBeDefined();
    }
  });

  it('accepts multiple starts', async () => {
    // Two disconnected chains: a→b, c→d
    const provider = buildProvider([
      { from: 'a', to: 'b' },
      { from: 'c', to: 'd' },
    ]);
    const engine = new GraphTraversal({ provider });
    const { sorted } = await engine.topologicalSort({ start: ['a', 'c'] });
    // a, c are zero-indegree. After a is processed, b becomes ready.
    // Ready queue: [a, c] → process a → ready: [b, c] → process b → ready: [c] → process c → ready: [d]
    expect(sorted).toEqual(['a', 'b', 'c', 'd']);
  });

  it('zero-indegree nodes dequeued in lex order', async () => {
    // All sources: e, d, c, b, a — should be a, b, c, d, e
    const provider = buildProvider([
      { from: 'e', to: 'z' },
      { from: 'd', to: 'z' },
      { from: 'c', to: 'z' },
      { from: 'b', to: 'z' },
      { from: 'a', to: 'z' },
    ]);
    const engine = new GraphTraversal({ provider });
    const { sorted } = await engine.topologicalSort({ start: ['a', 'b', 'c', 'd', 'e'] });
    expect(sorted).toEqual(['a', 'b', 'c', 'd', 'e', 'z']);
  });

  it('throws INVALID_START when any multi-start node is missing', async () => {
    const provider = buildProvider([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ]);
    const engine = new GraphTraversal({ provider });
    await expect(
      engine.topologicalSort({ start: ['a', 'missing'] }),
    ).rejects.toMatchObject({ code: 'INVALID_START' });
  });

  it('does not report a cycle when maxNodes truncates a DAG', async () => {
    const provider = buildProvider([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ]);
    const engine = new GraphTraversal({ provider });
    const { sorted, hasCycle } = await engine.topologicalSort({
      start: 'a',
      maxNodes: 1,
      throwOnCycle: true,
    });
    expect(hasCycle).toBe(false);
    expect(sorted).toEqual(['a']);
  });

  it('checks AbortSignal during discovery every thousand nodes', async () => {
    const edges: any[] = [];
    for (let i = 0; i < 999; i += 1) {
      edges.push({ from: 'root', to: `n${String(i).padStart(3, '0')}` });
    }
    const ac = new AbortController();
    ac.abort();
    const engine = new GraphTraversal({ provider: buildProvider(edges) });

    await expect(
      engine.topologicalSort({ start: 'root', signal: ac.signal }),
    ).rejects.toThrow(/aborted/i);
  });
});

// ==== commonAncestors Tests ====

describe('GraphTraversal.commonAncestors', () => {
  it('finds common ancestors in diamond', async () => {
    // a → b, a → c, b → d, c → d
    // Common ancestors of b and c: a (and b,c themselves are ancestors of self)
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const { ancestors } = await engine.commonAncestors({ nodes: ['b', 'c'] });
    // Both b and c are reachable from 'a' going backward.
    // b's ancestors (via 'in'): b, a
    // c's ancestors (via 'in'): c, a
    // Common: a
    expect(ancestors).toContain('a');
  });

  it('returns empty for no common ancestors', async () => {
    const provider = buildProvider([
      { from: 'x', to: 'a' },
      { from: 'y', to: 'b' },
    ]);
    const engine = new GraphTraversal({ provider });
    const { ancestors } = await engine.commonAncestors({ nodes: ['a', 'b'] });
    expect(ancestors).toEqual([]);
  });

  it('handles single node', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const { ancestors } = await engine.commonAncestors({ nodes: ['d'] });
    // All ancestors of d (via 'in'): d, b, c, a
    expect(ancestors.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('handles empty input', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const { ancestors } = await engine.commonAncestors({ nodes: [] });
    expect(ancestors).toEqual([]);
  });

  it('aggregates stats across all internal BFS runs', async () => {
    const provider = buildProvider([
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
    ]);
    const engine = new GraphTraversal({ provider });
    const { stats } = await engine.commonAncestors({ nodes: ['b', 'c'] });
    expect(stats.nodesVisited).toBe(4);
    expect(stats.edgesTraversed).toBe(2);
    expect(stats.cacheHits).toBe(0);
    expect(stats.cacheMisses).toBe(0);
  });

  it('respects maxResults when collecting the sorted intersection', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const { ancestors } = await engine.commonAncestors({ nodes: ['d'], maxResults: 2 });
    expect(ancestors).toEqual(['a', 'b']);
  });
});

// ==== weightedLongestPath Tests ====

describe('GraphTraversal.weightedLongestPath', () => {
  it('finds longest path in diamond', async () => {
    // a→b (w1), a→c (w5), b→d (w1), c→d (w1)
    // Longest: a→c→d = 6
    const provider = diamondProvider();
    const weights = new Map([
      ['a\0b', 1], ['a\0c', 5], ['b\0d', 1], ['c\0d', 1],
    ]);
    const engine = new GraphTraversal({ provider });
    const result = await engine.weightedLongestPath({
      start: 'a',
      goal: 'd',
      weightFn: (from, to) => weights.get(`${from}\0${to}`) ?? 1,
    });
    expect(result.path).toEqual(['a', 'c', 'd']);
    expect(result.totalCost).toBe(6);
  });

  it('finds longest with uniform weights', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const result = await engine.weightedLongestPath({
      start: 'a', goal: 'd',
    });
    // Both paths equal length=2 with uniform weight=1. Lex tie-break: b < c → predecessor of d = b
    expect(result.totalCost).toBe(2);
    expect(result.path).toEqual(['a', 'b', 'd']);
  });

  it('throws on cycle', async () => {
    const provider = buildProvider([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' },
    ]);
    const engine = new GraphTraversal({ provider });
    await expect(
      engine.weightedLongestPath({ start: 'a', goal: 'c' })
    ).rejects.toThrow(/cycle/i);
  });

  it('throws NO_PATH for unreachable', async () => {
    const provider = buildProvider([
      { from: 'a', to: 'b' },
      { from: 'c', to: 'd' },
    ]);
    const engine = new GraphTraversal({ provider });
    await expect(
      engine.weightedLongestPath({ start: 'a', goal: 'd' })
    ).rejects.toThrow(/NO_PATH|No path/);
  });

  it('skips sorted nodes outside the reachable DP frontier', async () => {
    const engine = new GraphTraversal({
      provider: buildProvider([{ from: 'a', to: 'b' }]),
    });
    engine.topologicalSort = async () => ({
      sorted: ['a', 'x', 'b'],
      hasCycle: false,
      stats: {
        nodesVisited: 3,
        edgesTraversed: 0,
        cacheHits: 0,
        cacheMisses: 0,
      },
      _neighborEdgeMap: new Map([
        ['a', [{ neighborId: 'b', label: '' }]],
        ['x', [{ neighborId: 'y', label: '' }]],
        ['b', []],
      ]),
    });

    const result = await engine.weightedLongestPath({ start: 'a', goal: 'b' });
    expect(result.path).toEqual(['a', 'b']);
    expect(result.totalCost).toBe(1);
  });

  it('falls back to provider neighbors when topo sort does not return adjacency state', async () => {
    const engine = new GraphTraversal({
      provider: buildProvider([{ from: 'a', to: 'b' }]),
    });
    engine.topologicalSort = async () => ({
      sorted: ['a', 'b'],
      hasCycle: false,
      stats: {
        nodesVisited: 2,
        edgesTraversed: 0,
        cacheHits: 0,
        cacheMisses: 0,
      },
    });

    const result = await engine.weightedLongestPath({ start: 'a', goal: 'b' });
    expect(result.path).toEqual(['a', 'b']);
    expect(result.totalCost).toBe(1);
  });
});

// ==== Stats Tests ====

describe('GraphTraversal stats', () => {
  it('tracks cache hits/misses for async providers', async () => {
    // Create a mock async provider
    const inner = diamondProvider();
        const asyncProvider = {
      getNeighbors: (/** @type {string} */ nodeId, /** @type {*} */ opts) => inner.getNeighbors(nodeId, opts),
      hasNode: (/** @type {string} */ nodeId) => inner.hasNode(nodeId),
      get latencyClass() { return 'async-local'; },
    };

    const engine = new GraphTraversal({ provider: (asyncProvider as any), neighborCacheSize: 10 });
    const { stats } = await engine.bfs({ start: 'a' });
    // First calls are all misses
    expect(stats.cacheMisses).toBeGreaterThan(0);
  });

  it('skips cache for sync providers', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const { stats } = await engine.bfs({ start: 'a' });
    expect(stats.cacheHits).toBe(0);
    expect(stats.cacheMisses).toBe(0);
  });

  it('uses collision-safe label cache keys when labels contain commas', async () => {
        const provider = {
      async getNeighbors(
        /** @type {string} */ _nodeId,
        /** @type {'out'|'in'|'both'} */ _direction,
        /** @type {import('../../../../src/ports/NeighborProviderPort.ts').NeighborOptions|undefined} */ options,
      ) {
        const labels = options?.labels ?? new Set();
        const hasAB = labels.has('a,b') && labels.has('c');
        const hasBC = labels.has('a') && labels.has('b,c');
        if (hasAB) {
          return [{ neighborId: 'x', label: 'rel' }];
        }
        if (hasBC) {
          return [{ neighborId: 'y', label: 'rel' }];
        }
        return [];
      },
      async hasNode(/** @type {string} */ nodeId) {
        return nodeId === 's' || nodeId === 'x' || nodeId === 'y';
      },
      /** @returns {'async-local'} */
      get latencyClass() { return 'async-local'; },
    };

    const engine = new GraphTraversal({ provider: (provider as any), neighborCacheSize: 16 });
    const first = await engine.bfs({
      start: 's',
      options: { labels: new Set(['a,b', 'c']) },
      maxDepth: 1,
    });
    const second = await engine.bfs({
      start: 's',
      options: { labels: new Set(['a', 'b,c']) },
      maxDepth: 1,
    });

    expect(first.nodes).toEqual(['s', 'x']);
    expect(second.nodes).toEqual(['s', 'y']);
  });
});

// ==== Hooks Tests ====

describe('GraphTraversal hooks', () => {
  it('calls onVisit for each visited node', async () => {
    /** @type {Array<{nodeId: string, depth: number}>} */
    const visited: any[] = [];
    const engine = new GraphTraversal({ provider: chainProvider() });
    await engine.bfs({
      start: 'a',
      hooks: { onVisit: (nodeId, depth) => visited.push({ nodeId, depth }) },
    });
    expect(visited.map(v => (v as any).nodeId)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(visited[0]?.depth).toBe(0);
    expect(visited[4]?.depth).toBe(4);
  });

  it('calls onExpand with neighbors', async () => {
    /** @type {Array<{nodeId: string, count: number}>} */
    const expanded: any[] = [];
    const engine = new GraphTraversal({ provider: diamondProvider() });
    await engine.bfs({
      start: 'a',
      hooks: { onExpand: (nodeId, neighbors) => expanded.push({ nodeId, count: neighbors.length }) },
    });
    expect(expanded[0]).toEqual({ nodeId: 'a', count: 2 });
  });
});

describe('GraphTraversal private helpers', () => {
  it('_findTopoCycleWitness skips sorted nodes and returns a live witness', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const witness = await engine._findTopoCycleWitness({
      discovered: new Set(['sorted', 'u']),
      sorted: ['sorted'],
      getNeighborIds: async (nodeId) => (nodeId === 'u' ? ['v'] : ['u']),
    });

    expect(witness).toEqual({ from: 'u', to: 'v' });
  });

  it('_findTopoCycleWitness returns an empty object when no witness remains', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const witness = await engine._findTopoCycleWitness({
      discovered: new Set(['u']),
      sorted: [],
      getNeighborIds: async () => [],
    });

    expect(witness).toEqual({});
  });

  it('_biAStarExpand returns immediately for stale heap entries', async () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const result = await engine._biAStarExpand({
      heap: (({
        extractMin: () => 'a',
        insert: () => {},
      }) as any),
      visited: new Set(['a']),
      gScore: new Map([['a', 0]]),
      predMap: new Map(),
      otherVisited: new Set(),
      otherG: new Map(),
      weightFn: () => 1,
      heuristicFn: () => 0,
      target: 'z',
      directionForNeighbors: 'out',
      mu: 7,
      meeting: 'm',
      rs: engine._newRunStats(),
    });

    expect(result).toEqual({ explored: 0, mu: 7, meeting: 'm' });
  });

  it('_biAStarExpand updates the meeting node when the current node closes the best path', async () => {
    const engine = new GraphTraversal({
      provider: buildProvider([{ from: 'a', to: 'b' }]),
    });
    const result = await engine._biAStarExpand({
      heap: (({
        extractMin: () => 'a',
        insert: () => {},
      }) as any),
      visited: new Set(),
      gScore: new Map([['a', 2]]),
      predMap: new Map(),
      otherVisited: new Set(['a']),
      otherG: new Map([['a', 3]]),
      weightFn: () => 1,
      heuristicFn: () => 0,
      target: 'z',
      directionForNeighbors: 'out',
      mu: Infinity,
      meeting: null,
      rs: engine._newRunStats(),
    });

    expect(result).toEqual({ explored: 1, mu: 5, meeting: 'a' });
  });

  it('_biAStarExpand skips neighbors that are already visited on this side', async () => {
    const inserts: Array<{nodeId: string; priority: number}> = [];
    const engine = new GraphTraversal({
      provider: buildProvider([
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
      ]),
    });
    const predMap = new Map();
    const result = await engine._biAStarExpand({
      heap: (({
        extractMin: () => 'a',
        insert: ( nodeId,  priority) => inserts.push({ nodeId, priority }),
      }) as any),
      visited: new Set(['b']),
      gScore: new Map([['a', 0]]),
      predMap,
      otherVisited: new Set(),
      otherG: new Map(),
      weightFn: () => 1,
      heuristicFn: () => 0,
      target: 'z',
      directionForNeighbors: 'out',
      mu: Infinity,
      meeting: null,
      rs: engine._newRunStats(),
    });

    expect(result.explored).toBe(1);
    expect(predMap.has('b')).toBe(false);
    expect(predMap.get('c')).toBe('a');
    expect(inserts).toEqual([{ nodeId: 'c', priority: 1 }]);
  });

  it('_reconstructPath stops when a predecessor chain is incomplete', () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    const path = engine._reconstructPath(new Map([['c', 'b']]), 'a', 'c');
    expect(path).toEqual(['b', 'c']);
  });

  it('_shouldUpdatePredecessor prefers the first predecessor when none is set', () => {
    const engine = new GraphTraversal({ provider: diamondProvider() });
    expect(engine._shouldUpdatePredecessor(new Map(), 'd', 'b')).toBe(true);
  });
});
