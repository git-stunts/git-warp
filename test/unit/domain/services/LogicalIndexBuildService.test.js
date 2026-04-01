import { describe, it, expect } from 'vitest';
import LogicalIndexBuildService from '../../../../src/domain/services/LogicalIndexBuildService.js';
import { createEmptyStateV5, applyOpV2 } from '../../../../src/domain/services/JoinReducer.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';
import { createEventId } from '../../../../src/domain/utils/EventId.js';
import defaultCodec from '../../../../src/domain/utils/defaultCodec.js';
import { encodeEdgePropKey } from '../../../../src/domain/services/KeyCodec.js';

/**
 * Helper: builds a WarpStateV5 from a simple fixture definition.
 */
/** @param {{ nodes: string[], edges: Array<{from: string, to: string, label: string}>, props?: Array<{nodeId: string, key: string, value: *}> }} params */
function buildState({ nodes, edges, props }) {
  const state = createEmptyStateV5();
  const writer = 'w1';
  const sha = 'a'.repeat(40);
  let opIdx = 0;
  let lamport = 1;

  for (const nodeId of nodes) {
    const dot = createDot(writer, lamport);
    const eventId = createEventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'NodeAdd', node: nodeId, dot }, eventId);
    lamport++;
  }

  for (const { from, to, label } of edges) {
    const dot = createDot(writer, lamport);
    const eventId = createEventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'EdgeAdd', from, to, label, dot }, eventId);
    lamport++;
  }

  for (const { nodeId, key, value } of (props || [])) {
    const eventId = createEventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'PropSet', node: nodeId, key, value }, eventId);
    lamport++;
  }

  return state;
}

describe('LogicalIndexBuildService', () => {
  it('builds from a programmatic WarpStateV5 with all shards present', () => {
    const state = buildState({
      nodes: ['A', 'B', 'C'],
      edges: [
        { from: 'A', to: 'B', label: 'knows' },
        { from: 'B', to: 'C', label: 'manages' },
      ],
      props: [
        { nodeId: 'A', key: 'name', value: 'Alice' },
      ],
    });

    const service = new LogicalIndexBuildService();
    const { tree, receipt } = service.build(state);

    // Must have at least: labels, receipt, some meta/fwd/rev shards
    expect(tree['labels.cbor']).toBeDefined();
    expect(tree['receipt.cbor']).toBeDefined();
    expect(receipt['nodeCount']).toBe(3);
    expect(receipt['labelCount']).toBe(2); // 'knows', 'manages'

    // Must have at least one props shard
    const propsShards = Object.keys(tree).filter((k) => k.startsWith('props_'));
    expect(propsShards.length).toBeGreaterThan(0);
  });

  it('stable rebuild: existing IDs preserved when new nodes added', () => {
    const state1 = buildState({
      nodes: ['A', 'B'],
      edges: [{ from: 'A', to: 'B', label: 'x' }],
      props: [],
    });

    const service = new LogicalIndexBuildService();
    const { tree: tree1 } = service.build(state1);

    // Extract existing meta + labels for seeding (array-of-pairs format)
    /** @type {Record<string, *>} */
    const existingMeta = {};
    for (const [path, buf] of Object.entries(tree1)) {
      if (path.startsWith('meta_') && path.endsWith('.cbor')) {
        const shardKey = path.slice(5, 7);
        existingMeta[shardKey] = defaultCodec.decode(buf);
      }
    }
    const existingLabels = /** @type {Record<string, number>|Array<[string, number]>} */ (defaultCodec.decode(tree1['labels.cbor']));

    // Build 2: add node C
    const state2 = buildState({
      nodes: ['A', 'B', 'C'],
      edges: [
        { from: 'A', to: 'B', label: 'x' },
        { from: 'B', to: 'C', label: 'y' },
      ],
      props: [],
    });

    const { tree: tree2 } = service.build(state2, /** @type {*} */ ({ existingMeta, existingLabels }));

    // Verify A and B still have same globalIds
    for (const [path, buf] of Object.entries(tree2)) {
      if (path.startsWith('meta_') && path.endsWith('.cbor')) {
        const shardKey = path.slice(5, 7);
        const meta2 = /** @type {Record<string, *>} */ (defaultCodec.decode(buf));
        const meta1 = existingMeta[shardKey];
        if (meta1) {
          // nodeToGlobal is array of [nodeId, globalId] pairs
          const meta1Map = new Map(meta1.nodeToGlobal);
          const meta2Map = new Map(meta2['nodeToGlobal']);
          for (const [nodeId, globalId] of meta1Map) {
            if (meta2Map.has(nodeId)) {
              expect(meta2Map.get(nodeId)).toBe(globalId);
            }
          }
        }
      }
    }
  });

  it('property index matches visible projection for all nodes', () => {
    const state = buildState({
      nodes: ['X', 'Y'],
      edges: [],
      props: [
        { nodeId: 'X', key: 'color', value: 'red' },
        { nodeId: 'X', key: 'size', value: 42 },
        { nodeId: 'Y', key: 'color', value: 'blue' },
      ],
    });

    const service = new LogicalIndexBuildService();
    const { tree } = service.build(state);

    // Decode all props shards and verify
    const allProps = new Map();
    for (const [path, buf] of Object.entries(tree)) {
      if (path.startsWith('props_')) {
        const entries = /** @type {Array<[string, *]>} */ (defaultCodec.decode(buf));
        for (const [nodeId, props] of entries) {
          allProps.set(nodeId, props);
        }
      }
    }

    expect(allProps.get('X')).toEqual({ color: 'red', size: 42 });
    expect(allProps.get('Y')).toEqual({ color: 'blue' });
  });

  it('empty state produces valid output', () => {
    const state = createEmptyStateV5();
    const service = new LogicalIndexBuildService();
    const { tree, receipt } = service.build(state);

    expect(receipt['nodeCount']).toBe(0);
    expect(tree['labels.cbor']).toBeDefined();
    expect(tree['receipt.cbor']).toBeDefined();
  });

  it('skips edge-property entries when building node property index', () => {
    const state = buildState({
      nodes: ['A', 'B'],
      edges: [{ from: 'A', to: 'B', label: 'knows' }],
      props: [{ nodeId: 'A', key: 'name', value: 'Alice' }],
    });

    const edgePropKey = encodeEdgePropKey('A', 'B', 'knows', 'weight');
    state.prop.set(edgePropKey, /** @type {any} */ ({ value: 99 }));

    const service = new LogicalIndexBuildService();
    const { tree } = service.build(state);

    const allProps = new Map();
    for (const [path, buf] of Object.entries(tree)) {
      if (path.startsWith('props_')) {
        const entries = /** @type {Array<[string, Record<string, unknown>]>} */ (defaultCodec.decode(buf));
        for (const [nodeId, props] of entries) {
          allProps.set(nodeId, props);
        }
      }
    }

    expect(allProps.get('A')).toEqual({ name: 'Alice' });
  });
});
