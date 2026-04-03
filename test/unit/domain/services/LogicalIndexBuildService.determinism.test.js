import { describe, it, expect } from 'vitest';
import LogicalIndexBuildService from '../../../../src/domain/services/index/LogicalIndexBuildService.js';
import { createEmptyStateV5, applyOpV2 } from '../../../../src/domain/services/JoinReducer.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';
import { createEventId } from '../../../../src/domain/utils/EventId.js';
import defaultCodec from '../../../../src/domain/utils/defaultCodec.js';

/**
 * Helper: builds a WarpStateV5 from nodes and edges, applying ops in the
 * given order. Different orderings of the same final state should produce
 * identical index mappings after the determinism sort fix.
 *
 * @param {string[]} nodes
 * @param {Array<{from: string, to: string, label: string}>} edges
 */
function buildState(nodes, edges) {
  const state = createEmptyStateV5();
  const writer = 'w1';
  const sha = 'a'.repeat(40);
  let opIdx = 0;
  let lamport = 1;

  for (const nodeId of nodes) {
    applyOpV2(state,
      { type: 'NodeAdd', node: nodeId, dot: createDot(writer, lamport) },
      createEventId(lamport, writer, sha, opIdx++));
    lamport++;
  }

  for (const { from, to, label } of edges) {
    applyOpV2(state,
      { type: 'EdgeAdd', from, to, label, dot: createDot(writer, lamport) },
      createEventId(lamport, writer, sha, opIdx++));
    lamport++;
  }

  return state;
}

/**
 * Extracts nodeToGlobal mappings from all meta shards in a serialized tree.
 * @param {Record<string, Uint8Array>} tree
 */
function extractNodeMappings(tree) {
  const mappings = new Map();
  for (const [path, buf] of Object.entries(tree)) {
    if (path.startsWith('meta_') && path.endsWith('.cbor')) {
      const meta = /** @type {{ nodeToGlobal: Array<[string, number]> }} */ (defaultCodec.decode(buf));
      for (const [nodeId, globalId] of meta.nodeToGlobal) {
        mappings.set(nodeId, globalId);
      }
    }
  }
  return mappings;
}

/**
 * Extracts label registry from a serialized tree.
 * @param {Record<string, Uint8Array>} tree
 */
function extractLabelRegistry(tree) {
  return defaultCodec.decode(/** @type {Uint8Array} */ (tree['labels.cbor']));
}

/**
 * Extracts decoded edge shard payloads from a serialized tree.
 * @param {Record<string, Uint8Array>} tree
 */
function extractEdgeShards(tree) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [path, buf] of Object.entries(tree)) {
    if ((path.startsWith('fwd_') || path.startsWith('rev_')) && path.endsWith('.cbor')) {
      out[path] = defaultCodec.decode(buf);
    }
  }
  return out;
}

describe('LogicalIndexBuildService determinism', () => {
  const edges = [
    { from: 'A', to: 'B', label: 'knows' },
    { from: 'B', to: 'C', label: 'manages' },
    { from: 'C', to: 'A', label: 'reports' },
  ];

  it('same state from different node insertion orders produces identical ID assignments', () => {
    // Order 1: A, B, C
    const state1 = buildState(['A', 'B', 'C'], edges);
    // Order 2: C, A, B (different insertion order, same final OR-Set)
    const state2 = buildState(['C', 'A', 'B'], edges);

    const service = new LogicalIndexBuildService();
    const { tree: tree1 } = service.build(state1);
    const { tree: tree2 } = service.build(state2);

    const mappings1 = extractNodeMappings(tree1);
    const mappings2 = extractNodeMappings(tree2);

    // Both should have the same nodeId → globalId assignments
    expect(mappings1.size).toBe(3);
    expect(mappings2.size).toBe(3);
    for (const [nodeId, globalId] of mappings1) {
      expect(mappings2.get(nodeId)).toBe(globalId);
    }
  });

  it('same state from different edge insertion orders produces identical label assignments', () => {
    const edgesOrder1 = [
      { from: 'A', to: 'B', label: 'knows' },
      { from: 'B', to: 'C', label: 'manages' },
      { from: 'C', to: 'A', label: 'reports' },
    ];
    const edgesOrder2 = [
      { from: 'C', to: 'A', label: 'reports' },
      { from: 'A', to: 'B', label: 'knows' },
      { from: 'B', to: 'C', label: 'manages' },
    ];

    const state1 = buildState(['A', 'B', 'C'], edgesOrder1);
    const state2 = buildState(['A', 'B', 'C'], edgesOrder2);

    const service = new LogicalIndexBuildService();
    const { tree: tree1 } = service.build(state1);
    const { tree: tree2 } = service.build(state2);

    const labels1 = extractLabelRegistry(tree1);
    const labels2 = extractLabelRegistry(tree2);

    // Both should have the same label → labelId assignments
    expect(labels1).toEqual(labels2);
  });

  it('meta shard nodeToGlobal pairs are sorted by nodeId (forced same-shard IDs)', () => {
    const sameShardNodes = [
      `aa${'0'.repeat(38)}`,
      `aa${'1'.repeat(38)}`,
      `aa${'2'.repeat(38)}`,
      `aa${'3'.repeat(38)}`,
    ];
    const state = buildState(sameShardNodes, []);

    const service = new LogicalIndexBuildService();
    const { tree } = service.build(state);
    const buf = /** @type {Uint8Array} */ (tree['meta_aa.cbor']);
    expect(buf).toBeDefined();
    const meta = /** @type {{ nodeToGlobal: Array<[string, number]> }} */ (defaultCodec.decode(buf));
    const nodeIds = meta.nodeToGlobal.map((/** @type {[string, number]} */ pair) => pair[0]);
    expect(nodeIds.length).toBe(4);
    expect(nodeIds).toEqual([...nodeIds].sort());
  });

  it('same state from different edge insertion orders produces identical edge shard payloads', () => {
    const edgesOrder1 = [
      { from: 'A', to: 'B', label: 'knows' },
      { from: 'A', to: 'C', label: 'manages' },
      { from: 'C', to: 'A', label: 'reports' },
      { from: 'B', to: 'C', label: 'knows' },
    ];
    const edgesOrder2 = [
      { from: 'B', to: 'C', label: 'knows' },
      { from: 'C', to: 'A', label: 'reports' },
      { from: 'A', to: 'C', label: 'manages' },
      { from: 'A', to: 'B', label: 'knows' },
    ];

    const state1 = buildState(['A', 'B', 'C'], edgesOrder1);
    const state2 = buildState(['A', 'B', 'C'], edgesOrder2);

    const service = new LogicalIndexBuildService();
    const { tree: tree1 } = service.build(state1);
    const { tree: tree2 } = service.build(state2);

    expect(extractEdgeShards(tree1)).toEqual(extractEdgeShards(tree2));
  });
});
