/**
 * Canonical test fixture DSL.
 *
 * One source of truth for graph fixtures — derive adjacency maps,
 * providers, and (later) index inputs from the same definition.
 * Never hand-maintain parallel fixtures.
 *
 * @module test/helpers/fixtureDsl
 */

import { deepStrictEqual } from 'node:assert/strict';
import AdjacencyNeighborProvider from '../../src/domain/services/AdjacencyNeighborProvider.js';
import BitmapNeighborProvider from '../../src/domain/services/BitmapNeighborProvider.js';
import LogicalIndexBuildService from '../../src/domain/services/LogicalIndexBuildService.js';
import LogicalIndexReader from '../../src/domain/services/LogicalIndexReader.js';
import { createEmptyStateV5, applyOpV2 } from '../../src/domain/services/JoinReducer.js';
import { createDot } from '../../src/domain/crdt/Dot.js';
import { createEventId } from '../../src/domain/utils/EventId.js';

/**
 * Normalizes a thrown value into an object with `.name` and `.message` for
 * comparison. Non-Error throws (strings, numbers, etc.) lack these properties,
 * which would cause the mismatch check to silently treat different non-Error
 * values as equal.
 *
 * @param {unknown} err
 * @returns {{ name: string, message: string }}
 */
function normalizeError(err) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  return { name: typeof err, message: String(err) };
}

// ── Core DSL ────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} GraphFixture
 * @property {string[]} nodes - All alive node IDs
 * @property {Array<{from: string, to: string, label: string}>} edges - Directed edges
 * @property {Array<{nodeId: string, key: string, value: unknown, lamport?: number}>} [props] - Node properties
 * @property {{ nodes?: Set<string>, edges?: Set<string> }} [tombstones] - Tombstoned items (edgeKey = "from\0to\0label")
 */

/**
 * Creates a canonical fixture. Validates that all edge endpoints are in nodes.
 *
 * @param {Object} params
 * @param {string[]} params.nodes
 * @param {Array<{from: string, to: string, label?: string}>} params.edges
 * @param {Array<{nodeId: string, key: string, value: unknown, lamport?: number}>} [params.props]
 * @param {{ nodes?: Set<string>, edges?: Set<string> }} [params.tombstones]
 * @returns {GraphFixture}
 */
export function makeFixture({ nodes, edges, props = [], tombstones = {} }) {
  const nodeSet = new Set(nodes);
  const normalizedEdges = edges.map(({ from, to, label }) => ({
    from, to, label: label ?? '',
  }));
  const edgeKeySet = new Set(
    normalizedEdges.map(({ from, to, label }) => `${from}\0${to}\0${label}`),
  );
  const tombstoneNodes = tombstones.nodes ?? new Set();
  const tombstoneEdges = tombstones.edges ?? new Set();

  // Validate: all edge endpoints must be in nodes
  for (const { from, to } of normalizedEdges) {
    if (!nodeSet.has(from)) {
      throw new Error(`Edge from '${from}' — node not in fixture.nodes`);
    }
    if (!nodeSet.has(to)) {
      throw new Error(`Edge to '${to}' — node not in fixture.nodes`);
    }
  }

  for (const { nodeId } of props) {
    if (!nodeSet.has(nodeId)) {
      throw new Error(`Prop target '${nodeId}' — node not in fixture.nodes`);
    }
  }

  for (const nodeId of tombstoneNodes) {
    if (!nodeSet.has(nodeId)) {
      throw new Error(`Tombstoned node '${nodeId}' — node not in fixture.nodes`);
    }
  }

  for (const edgeKey of tombstoneEdges) {
    if (!edgeKeySet.has(edgeKey)) {
      throw new Error(`Tombstoned edge '${edgeKey}' — edge not in fixture.edges`);
    }
  }

  return { nodes, edges: normalizedEdges, props, tombstones };
}

// ── Projection Builders ─────────────────────────────────────────────────────

/**
 * Builds sorted adjacency maps from a fixture. Respects tombstones.
 *
 * @param {GraphFixture} fixture
 * @returns {{ outgoing: Map<string, Array<{neighborId: string, label: string}>>, incoming: Map<string, Array<{neighborId: string, label: string}>>, aliveNodes: Set<string> }}
 */
export function toAdjacencyMaps(fixture) {
  const outgoing = new Map();
  const incoming = new Map();
  const tombEdges = fixture.tombstones?.edges ?? new Set();
  const tombNodes = fixture.tombstones?.nodes ?? new Set();

  const aliveNodes = new Set(fixture.nodes.filter((n) => !tombNodes.has(n)));

  for (const { from, to, label } of fixture.edges) {
    const edgeKey = `${from}\0${to}\0${label}`;
    if (tombEdges.has(edgeKey)) continue;
    if (!aliveNodes.has(from) || !aliveNodes.has(to)) continue;

    if (!outgoing.has(from)) outgoing.set(from, []);
    outgoing.get(from).push({ neighborId: to, label });

    if (!incoming.has(to)) incoming.set(to, []);
    incoming.get(to).push({ neighborId: from, label });
  }

  const cmp = (
    /** @type {{neighborId: string, label: string}} */ a,
    /** @type {{neighborId: string, label: string}} */ b,
  ) => {
    if (a.neighborId < b.neighborId) return -1;
    if (a.neighborId > b.neighborId) return 1;
    if (a.label < b.label) return -1;
    if (a.label > b.label) return 1;
    return 0;
  };
  for (const arr of outgoing.values()) arr.sort(cmp);
  for (const arr of incoming.values()) arr.sort(cmp);

  return { outgoing, incoming, aliveNodes };
}

/**
 * Creates an AdjacencyNeighborProvider from a fixture.
 *
 * @param {GraphFixture} fixture
 * @returns {AdjacencyNeighborProvider}
 */
export function makeAdjacencyProvider(fixture) {
  const { outgoing, incoming, aliveNodes } = toAdjacencyMaps(fixture);
  return new AdjacencyNeighborProvider({ outgoing, incoming, aliveNodes });
}

// ── Canonical Fixtures ──────────────────────────────────────────────────────

/**
 * F1 — BFS_LEVEL_SORT_TRAP
 *
 * Catches the biggest "looks deterministic but isn't" BFS bug.
 * A naive queue BFS gives A, B, C, Z, D — wrong.
 * Correct depth-sorted BFS gives A, B, C, D, Z.
 *
 *       A
 *      / \
 *     B   C
 *     |   |
 *     Z   D
 */
export const F1_BFS_LEVEL_SORT_TRAP = makeFixture({
  nodes: ['A', 'B', 'C', 'D', 'Z'],
  edges: [
    { from: 'A', to: 'B' },
    { from: 'A', to: 'C' },
    { from: 'B', to: 'Z' },
    { from: 'C', to: 'D' },
  ],
});

/**
 * F2 — DFS_LEFTMOST_REVERSE_PUSH
 *
 * Tests iterative DFS reverse-push for leftmost-first.
 * Neighbors of A are [B, C] (sorted). Push C then B.
 * Pop B → explore B's child D. Pop C → explore C's child E.
 * Expected: A, B, D, C, E
 *
 *       A
 *      / \
 *     B   C
 *     |   |
 *     D   E
 */
export const F2_DFS_LEFTMOST_REVERSE_PUSH = makeFixture({
  nodes: ['A', 'B', 'C', 'D', 'E'],
  edges: [
    { from: 'A', to: 'B' },
    { from: 'A', to: 'C' },
    { from: 'B', to: 'D' },
    { from: 'C', to: 'E' },
  ],
});

/**
 * F3 — DIAMOND_EQUAL_PATHS
 *
 * Two equal-length paths: A→B→D and A→C→D.
 * shortestPath(A, D) should return A→B→D (B < C).
 * topoSort(A) should return A, B, C, D.
 *
 *       A
 *      / \
 *     B   C
 *      \ /
 *       D
 */
export const F3_DIAMOND_EQUAL_PATHS = makeFixture({
  nodes: ['A', 'B', 'C', 'D'],
  edges: [
    { from: 'A', to: 'B' },
    { from: 'A', to: 'C' },
    { from: 'B', to: 'D' },
    { from: 'C', to: 'D' },
  ],
});

/**
 * F4 — DIJKSTRA_EQUAL_COST_PREDECESSOR_UPDATE
 *
 * S→C→G = 1+4 = 5, S→B→G = 3+2 = 5. Equal cost.
 * G first reached via C (cost 5), then via B (also 5).
 * Predecessor update rule: B < C → path becomes S→B→G.
 *
 *     S
 *    / \
 *   C   B
 *  (1) (3)
 *    \ /
 *     G
 *  (4)(2)
 */
export const F4_DIJKSTRA_EQUAL_COST_PREDECESSOR = makeFixture({
  nodes: ['S', 'B', 'C', 'G'],
  edges: [
    { from: 'S', to: 'C' },
    { from: 'C', to: 'G' },
    { from: 'S', to: 'B' },
    { from: 'B', to: 'G' },
  ],
});

/** Weight map for F4 */
export const F4_WEIGHTS = new Map([
  ['S\0C\0', 1],
  ['C\0G\0', 4],
  ['S\0B\0', 3],
  ['B\0G\0', 2],
]);

/**
 * F5 — ASTAR_TIE_BREAK_EXPANSION_ORDER
 *
 * S→B(1), S→C(1), B→G(10), C→G(10).
 * With heuristic=0, A* reduces to Dijkstra. Equal f-score on B and C.
 * First expanded after S should be B (B < C).
 */
export const F5_ASTAR_TIE_BREAK = makeFixture({
  nodes: ['S', 'B', 'C', 'G'],
  edges: [
    { from: 'S', to: 'B' },
    { from: 'S', to: 'C' },
    { from: 'B', to: 'G' },
    { from: 'C', to: 'G' },
  ],
});

/** Weight map for F5 */
export const F5_WEIGHTS = new Map([
  ['S\0B\0', 1],
  ['S\0C\0', 1],
  ['B\0G\0', 10],
  ['C\0G\0', 10],
]);

/**
 * F6 — BOTH_DIRECTION_DEDUP
 *
 * A —x→ B, B —x→ A, B —y→ A, A —x→ C.
 * getNeighbors(A, 'both') should return:
 *   (B, x), (B, y), (C, x) — sorted, (B,x) appears only once.
 */
export const F6_BOTH_DIRECTION_DEDUP = makeFixture({
  nodes: ['A', 'B', 'C'],
  edges: [
    { from: 'A', to: 'B', label: 'x' },
    { from: 'B', to: 'A', label: 'x' },
    { from: 'B', to: 'A', label: 'y' },
    { from: 'A', to: 'C', label: 'x' },
  ],
});

/**
 * F7 — MULTILABEL_SAME_NEIGHBOR
 *
 * A —manages→ B, A —owns→ B.
 * getNeighbors(A, 'out') returns TWO edges: (B,manages), (B,owns).
 * Critical for Phase 4 delete correctness: delete 'owns' edge,
 * 'manages' edge must survive, 'all' bitmap must still contain B.
 */
export const F7_MULTILABEL_SAME_NEIGHBOR = makeFixture({
  nodes: ['A', 'B'],
  edges: [
    { from: 'A', to: 'B', label: 'manages' },
    { from: 'A', to: 'B', label: 'owns' },
  ],
});

/**
 * F8 — TOPO_CYCLE_3
 *
 * A → B → C → A. Cycle.
 */
export const F8_TOPO_CYCLE_3 = makeFixture({
  nodes: ['A', 'B', 'C'],
  edges: [
    { from: 'A', to: 'B' },
    { from: 'B', to: 'C' },
    { from: 'C', to: 'A' },
  ],
});

/**
 * F9 — UNICODE_CODEPOINT_ORDER
 *
 * Proves no localeCompare anywhere.
 * Codepoint order: 'A' (65) < 'a' (97) < 'ä' (228).
 * BFS from S should visit: S, A, a, ä.
 */
export const F9_UNICODE_CODEPOINT_ORDER = makeFixture({
  nodes: ['S', 'A', 'a', 'ä'],
  edges: [
    { from: 'S', to: 'A' },
    { from: 'S', to: 'a' },
    { from: 'S', to: 'ä' },
  ],
});

/**
 * F10 — PROTO_POLLUTION_IDS
 *
 * Forces safe keying: nodes with names that would pollute Object.prototype.
 * Building/loading index must NOT mutate Object.prototype.
 */
export const F10_PROTO_POLLUTION = makeFixture({
  nodes: ['node:1', '__proto__', 'constructor', 'toString'],
  edges: [
    { from: 'node:1', to: '__proto__', label: 'owns' },
    { from: '__proto__', to: 'constructor', label: 'owns' },
  ],
  props: [
    { nodeId: '__proto__', key: 'polluted', value: true },
  ],
});

// F11 and F12 are index-specific — defined here for reference,
// tested in Phase 2 unit tests (shardKey.test.js, LogicalBitmapIndexBuilder.stability.test.js).

/**
 * F11 — SHARDKEY_VECTORS
 *
 * Known FNV-1a 32-bit vectors (Math.imul semantics).
 * Tested in shardKey.test.js.
 */
export const F11_SHARDKEY_VECTORS = {
  vectors: [
    { input: '', hash: 0x811c9dc5 },
    { input: 'a', hash: 0xe40c292c },
    { input: 'foobar', hash: 0xbf9cf968 },
  ],
  shardKeys: [
    { input: 'user:alice', expectedShardKey: '10' },
    { input: '__proto__', expectedShardKey: 'bd' },
    // SHA-like input (40+ hex chars) → use substring(0,2)
    { input: 'abcdef1234567890abcdef1234567890abcdef12', expectedShardKey: 'ab' },
    // Uppercase hex → case-insensitive → lowercase
    { input: 'ABCDEF1234567890ABCDEF1234567890ABCDEF12', expectedShardKey: 'ab' },
  ],
};

/**
 * F12 — STABLE_IDS_REBUILD_APPEND_ONLY
 *
 * Procedure: build index from [A,B,C], record IDs, rebuild with [D,E] added,
 * assert A/B/C IDs unchanged, D/E appended after nextLocalId.
 * Also tests near-overflow: seed nextLocalId = 2^24, attempt allocation → E_SHARD_ID_OVERFLOW.
 *
 * Defined as data, tested in LogicalBitmapIndexBuilder.stability.test.js (Phase 2).
 */
export const F12_STABLE_IDS = {
  initialNodes: ['A', 'B', 'C'],
  addedNodes: ['D', 'E'],
  overflowNextLocalId: 2 ** 24,
};

/**
 * F13 — BFS_MULTI_PARENT_DEDUP
 *
 * Multiple parents in the same BFS level all point to the same child D.
 * Without dedup in nextLevel, D would appear 3 times in the queue.
 * Correct BFS should only enqueue D once and visit it once.
 *
 *     A
 *    /|\
 *   B C E
 *    \|/
 *     D
 */
export const F13_BFS_MULTI_PARENT_DEDUP = makeFixture({
  nodes: ['A', 'B', 'C', 'D', 'E'],
  edges: [
    { from: 'A', to: 'B' },
    { from: 'A', to: 'C' },
    { from: 'A', to: 'E' },
    { from: 'B', to: 'D' },
    { from: 'C', to: 'D' },
    { from: 'E', to: 'D' },
  ],
});

/**
 * F14 — NODE_WEIGHTED_DAG
 *
 * Tests node-weighted path algorithms.
 * Node weights: START=0, A=3, B=5, C=2, END=0.
 * Weight = cost to enter the `to` node.
 *
 * START --(x)--> A --(x)--> C --(x)--> END
 * START --(x)--> B --(x)--> C
 *
 * Shortest: START→A→C→END = 3+2+0 = 5
 * Longest:  START→B→C→END = 5+2+0 = 7
 */
export const F14_NODE_WEIGHTED_DAG = makeFixture({
  nodes: ['START', 'A', 'B', 'C', 'END'],
  edges: [
    { from: 'START', to: 'A' },
    { from: 'START', to: 'B' },
    { from: 'A', to: 'C' },
    { from: 'B', to: 'C' },
    { from: 'C', to: 'END' },
  ],
});

/** Node weight map for F14 */
export const F14_NODE_WEIGHTS = new Map([
  ['START', 0],
  ['A', 3],
  ['B', 5],
  ['C', 2],
  ['END', 0],
]);

/**
 * F15 — WIDE_DAG_FOR_LEVELS
 *
 * Tests longest-path level assignment.
 * A→B, A→C, B→D, D→E, C→E.
 * Longest path to each: A=0, B=1, C=1, D=2, E=3 (via A→B→D→E, not A→C→E).
 *
 *       A
 *      / \
 *     B   C
 *     |    \
 *     D     |
 *      \   /
 *       E
 */
export const F15_WIDE_DAG_FOR_LEVELS = makeFixture({
  nodes: ['A', 'B', 'C', 'D', 'E'],
  edges: [
    { from: 'A', to: 'B' },
    { from: 'A', to: 'C' },
    { from: 'B', to: 'D' },
    { from: 'D', to: 'E' },
    { from: 'C', to: 'E' },
  ],
});

/**
 * F16 — TRANSITIVE_REDUCTION
 *
 * A→B, A→C (redundant), B→C.
 * Transitive reduction removes A→C because A→B→C already reaches C.
 *
 *   A ──→ B
 *    \    ↓
 *     └→ C
 */
export const F16_TRANSITIVE_REDUCTION = makeFixture({
  nodes: ['A', 'B', 'C'],
  edges: [
    { from: 'A', to: 'B' },
    { from: 'A', to: 'C' },
    { from: 'B', to: 'C' },
  ],
});

/**
 * F17 — MULTI_ROOT_DAG
 *
 * Two root nodes (in-degree 0) converge on D.
 * R1→A→D, R2→B→D, R2→C→D.
 * rootAncestors(D) should return [R1, R2].
 *
 *   R1 → A ──┐
 *             ↓
 *   R2 → B → D
 *    └→ C ──┘
 */
export const F17_MULTI_ROOT_DAG = makeFixture({
  nodes: ['R1', 'R2', 'A', 'B', 'C', 'D'],
  edges: [
    { from: 'R1', to: 'A' },
    { from: 'A', to: 'D' },
    { from: 'R2', to: 'B' },
    { from: 'R2', to: 'C' },
    { from: 'B', to: 'D' },
    { from: 'C', to: 'D' },
  ],
});

/**
 * F18 — TRANSITIVE_CLOSURE_CHAIN
 *
 * A→B→C→D. Linear chain.
 * Transitive closure adds: A→C, A→D, B→D = 3 new edges + 3 existing = 6 total.
 */
export const F18_TRANSITIVE_CLOSURE_CHAIN = makeFixture({
  nodes: ['A', 'B', 'C', 'D'],
  edges: [
    { from: 'A', to: 'B' },
    { from: 'B', to: 'C' },
    { from: 'C', to: 'D' },
  ],
});

// ── Utility: weight function from a Map ─────────────────────────────────────

/**
 * Creates a weight function from a Map keyed by "from\0to\0label".
 *
 * @param {Map<string, number>} weights
 * @param {number} [defaultWeight=1]
 * @returns {(from: string, to: string, label: string) => number}
 */
export function makeWeightFn(weights, defaultWeight = 1) {
  return (from, to, label) => {
    const key = `${from}\0${to}\0${label}`;
    return weights.get(key) ?? defaultWeight;
  };
}

/**
 * Creates a node weight function from a Map keyed by nodeId.
 *
 * @param {Map<string, number>} weights
 * @param {number} [defaultWeight=1]
 * @returns {(nodeId: string) => number}
 */
export function makeNodeWeightFn(weights, defaultWeight = 1) {
  return (nodeId) => weights.get(nodeId) ?? defaultWeight;
}

// ── Utility: cross-provider equivalence runner ──────────────────────────────

/**
 * Runs an algorithm test function against multiple providers,
 * asserting identical results. Use in every algorithm test to
 * enforce cross-provider equivalence.
 *
 * @param {Object} params
 * @param {GraphFixture} params.fixture
 * @param {Array<{name: string, provider: import('../../src/ports/NeighborProviderPort.js').default}>} params.providers
 * @param {(engine: import('../../src/domain/services/GraphTraversal.js').default) => Promise<unknown>} params.run
 * @param {(result: unknown) => void} params.assert
 */
export async function runCrossProvider({ fixture, providers, run, assert }) {
  const results = [];
  for (const { name, provider } of providers) {
    const { default: GraphTraversal } = await import('../../src/domain/services/GraphTraversal.js');
    const engine = new GraphTraversal({ provider });
    try {
      const result = await run(engine);
      results.push({ name, result, error: null });
    } catch (err) {
      results.push({ name, result: null, error: err });
    }
  }

  // Enforce provider-to-provider equivalence before running per-provider assertions.
  if (results.length > 1) {
    const baseline = results[0];
    for (const current of results.slice(1)) {
      const baselineErrored = Boolean(baseline.error);
      const currentErrored = Boolean(current.error);
      if (baselineErrored !== currentErrored) {
        throw new Error(
          `Provider mismatch: '${baseline.name}' ${baselineErrored ? 'threw' : 'returned'} but '${current.name}' ${currentErrored ? 'threw' : 'returned'}`
        );
      }
      if (baselineErrored && currentErrored) {
        const baseErr = normalizeError(baseline.error);
        const curErr = normalizeError(current.error);
        if (baseErr.name !== curErr.name || baseErr.message !== curErr.message) {
          throw new Error(
            `Provider mismatch: '${baseline.name}' and '${current.name}' threw different errors`
          );
        }
        continue;
      }
      try {
        deepStrictEqual(current.result, baseline.result);
      } catch {
        throw new Error(
          `Provider mismatch: '${baseline.name}' and '${current.name}' returned different results`
        );
      }
    }
  }

  // All providers must produce same outcome
  for (const { name, result, error } of results) {
    if (error) {
      // If one throws, verify the assertion expects a throw
      try {
        assert(error);
      } catch {
        throw new Error(`Provider '${name}' threw unexpectedly: ${/** @type {Error} */ (error).message}`);
      }
    } else {
      try {
        assert(result);
      } catch (e) {
        throw new Error(`Provider '${name}' failed assertion: ${/** @type {Error} */ (e).message}`);
      }
    }
  }
}

// ── Logical Bitmap Provider ─────────────────────────────────────────────────

/**
 * Builds a WarpStateV5 from a fixture, runs LogicalIndexBuildService,
 * creates an in-memory LogicalIndex, and wraps in BitmapNeighborProvider.
 *
 * @param {GraphFixture} fixture
 * @returns {BitmapNeighborProvider}
 */
export function makeLogicalBitmapProvider(fixture) {
  // Build WarpStateV5 from fixture
  const state = fixtureToState(fixture);

  // Build logical index
  const service = new LogicalIndexBuildService();
  const { tree } = service.build(state);

  // Create in-memory LogicalIndex adapter from serialized tree
  const logicalIndex = _createLogicalIndexFromTree(tree);

  return new BitmapNeighborProvider({ logicalIndex });
}

/**
 * Converts a fixture to WarpStateV5.
 * @param {GraphFixture} fixture
 * @returns {import('../../src/domain/services/JoinReducer.js').WarpStateV5}
 */
export function fixtureToState(fixture) {
  const state = createEmptyStateV5();
  const writer = 'w1';
  const sha = 'a'.repeat(40);
  let opIdx = 0;
  let lamport = 1;

  for (const nodeId of fixture.nodes) {
    const dot = createDot(writer, lamport);
    const eventId = createEventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'NodeAdd', node: nodeId, dot }, eventId);
    lamport++;
  }

  // Apply tombstones for nodes
  const tombNodes = fixture.tombstones?.nodes ?? new Set();
  for (const nodeId of tombNodes) {
    const dots = state.nodeAlive.entries.get(nodeId);
    if (dots) {
      const eventId = createEventId(lamport, writer, sha, opIdx++);
      applyOpV2(state, /** @type {*} */ ({ type: 'NodeRemove', node: nodeId, observedDots: new Set(dots) }), eventId);
      lamport++;
    }
  }

  for (const { from, to, label } of fixture.edges) {
    const dot = createDot(writer, lamport);
    const eventId = createEventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'EdgeAdd', from, to, label, dot }, eventId);
    lamport++;
  }

  // Apply tombstones for edges
  const tombEdges = fixture.tombstones?.edges ?? new Set();
  for (const edgeKey of tombEdges) {
    const dots = state.edgeAlive.entries.get(edgeKey);
    if (dots) {
      const [from, to, label] = edgeKey.split('\0');
      const eventId = createEventId(lamport, writer, sha, opIdx++);
      applyOpV2(state, /** @type {*} */ ({ type: 'EdgeRemove', from, to, label, observedDots: new Set(dots) }), eventId);
      lamport++;
    }
  }

  for (const { nodeId, key, value, lamport: propLamport } of (fixture.props || [])) {
    const tick = propLamport ?? lamport;
    const eventId = createEventId(tick, writer, sha, opIdx++);
    applyOpV2(state, { type: 'PropSet', node: nodeId, key, value }, eventId);
    lamport = Math.max(lamport, tick) + 1;
  }

  return state;
}

/**
 * Creates a LogicalIndex object from serialized index tree (in-memory).
 * Delegates to LogicalIndexReader (production code).
 *
 * @param {Record<string, Uint8Array>} tree
 * @returns {import('../../src/domain/services/BitmapNeighborProvider.js').LogicalIndex}
 * @private
 */
function _createLogicalIndexFromTree(tree) {
  return new LogicalIndexReader().loadFromTree(tree).toLogicalIndex();
}
