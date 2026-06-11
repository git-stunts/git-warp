import { describe, it, expect } from 'vitest';
import LogicalIndexBuildService from '../../../../src/domain/services/index/LogicalIndexBuildService.ts';
import { createEmptyState, applyPatchOp } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import { encodeEdgePropKey } from '../../../../src/domain/services/KeyCodec.ts';
import { MetaShard } from '../../../../src/domain/artifacts/MetaShard.ts';
import { LabelShard } from '../../../../src/domain/artifacts/LabelShard.ts';
import { PropertyShard } from '../../../../src/domain/artifacts/PropertyShard.ts';
import { ReceiptShard } from '../../../../src/domain/artifacts/ReceiptShard.ts';

/**
 * Helper: builds a WarpState from a simple fixture definition.
 */
/** @param {{ nodes: string[], edges: Array<{from: string, to: string, label: string}>, props?: Array<{nodeId: string, key: string, value: *}> }} params */
function buildState({ nodes, edges, props }) {
  const state = createEmptyState();
  const writer = 'w1';
  const sha = 'a'.repeat(40);
  let opIdx = 0;
  let lamport = 1;

  for (const nodeId of nodes) {
    const dot = Dot.create(writer, lamport);
    const eventId = new EventId(lamport, writer, sha, opIdx++);
    applyPatchOp(state, { type: 'NodeAdd', node: nodeId, dot }, eventId);
    lamport++;
  }

  for (const { from, to, label } of edges) {
    const dot = Dot.create(writer, lamport);
    const eventId = new EventId(lamport, writer, sha, opIdx++);
    applyPatchOp(state, { type: 'EdgeAdd', from, to, label, dot }, eventId);
    lamport++;
  }

  for (const { nodeId, key, value } of (props || [])) {
    const eventId = new EventId(lamport, writer, sha, opIdx++);
    applyPatchOp(state, { type: 'PropSet', node: nodeId, key, value }, eventId);
    lamport++;
  }

  return state;
}

describe('LogicalIndexBuildService', () => {
  it('builds from a programmatic WarpState with all shards present', async () => {
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
    const { stream, receipt } = service.buildStream(state);
    const shards = await stream.collect();

    // Must have labels, receipt, meta, edge, and property shards
    expect(shards.some((s) => s instanceof LabelShard)).toBe(true);
    expect(shards.some((s) => s instanceof ReceiptShard)).toBe(true);
    expect(receipt.nodeCount).toBe(3);
    expect(receipt.labelCount).toBe(2); // 'knows', 'manages'

    // Must have at least one property shard
    const propShards = shards.filter((s) => s instanceof PropertyShard);
    expect(propShards.length).toBeGreaterThan(0);
  });

  it('stable rebuild: existing IDs preserved when new nodes added', async () => {
    const state1 = buildState({
      nodes: ['A', 'B'],
      edges: [{ from: 'A', to: 'B', label: 'x' }],
      props: [],
    });

    const service = new LogicalIndexBuildService();
    const { stream: stream1 } = service.buildStream(state1);
    const shards1 = await stream1.collect();

    // Extract existing meta + labels for seeding
        const existingMeta = ({}) as Record<string, any>;
    for (const shard of shards1) {
      if (shard instanceof MetaShard) {
        existingMeta[shard.shardKey] = {
          nodeToGlobal: shard.nodeToGlobal,
          nextLocalId: shard.nextLocalId,
        };
      }
    }
    const labelShard = shards1.find((s) => s instanceof LabelShard);
    expect(labelShard).toBeDefined();
    const existingLabels = (labelShard as any).labels;

    // Build 2: add node C
    const state2 = buildState({
      nodes: ['A', 'B', 'C'],
      edges: [
        { from: 'A', to: 'B', label: 'x' },
        { from: 'B', to: 'C', label: 'y' },
      ],
      props: [],
    });

    const { stream: stream2 } = service.buildStream(state2, ({ existingMeta, existingLabels } as any));
    const shards2 = await stream2.collect();

    // Verify A and B still have same globalIds
    const meta1Map = new Map();
    for (const s of shards1) {
      if (s instanceof MetaShard) {
        for (const [nodeId, globalId] of s.nodeToGlobal) {
          meta1Map.set(nodeId, globalId);
        }
      }
    }
    const meta2Map = new Map();
    for (const s of shards2) {
      if (s instanceof MetaShard) {
        for (const [nodeId, globalId] of s.nodeToGlobal) {
          meta2Map.set(nodeId, globalId);
        }
      }
    }

    for (const [nodeId, globalId] of meta1Map) {
      if (meta2Map.has(nodeId)) {
        expect(meta2Map.get(nodeId)).toBe(globalId);
      }
    }
  });

  it('property index matches visible projection for all nodes', async () => {
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
    const { stream } = service.buildStream(state);
    const shards = await stream.collect();

    // Collect all property entries
    const allProps = new Map();
    for (const shard of shards) {
      if (shard instanceof PropertyShard) {
        for (const [nodeId, props] of shard.entries) {
          allProps.set(nodeId, props);
        }
      }
    }

    expect(allProps.get('X')).toEqual({ color: 'red', size: 42 });
    expect(allProps.get('Y')).toEqual({ color: 'blue' });
  });

  it('empty state produces valid output', async () => {
    const state = createEmptyState();
    const service = new LogicalIndexBuildService();
    const { stream, receipt } = service.buildStream(state);
    const shards = await stream.collect();

    expect(receipt.nodeCount).toBe(0);
    expect(shards.some((s) => s instanceof LabelShard)).toBe(true);
    expect(shards.some((s) => s instanceof ReceiptShard)).toBe(true);
  });

  it('skips edge-property entries when building node property index', async () => {
    const state = buildState({
      nodes: ['A', 'B'],
      edges: [{ from: 'A', to: 'B', label: 'knows' }],
      props: [{ nodeId: 'A', key: 'name', value: 'Alice' }],
    });

    const edgePropKey = encodeEdgePropKey('A', 'B', 'knows', 'weight');
    state.mutatePropLWW(edgePropKey, ({ lamport: 1, writerId: 'w', patchSha: 'abcd', opIndex: 0 } as any), 99);

    const service = new LogicalIndexBuildService();
    const { stream } = service.buildStream(state);
    const shards = await stream.collect();

    const allProps = new Map();
    for (const shard of shards) {
      if (shard instanceof PropertyShard) {
        for (const [nodeId, props] of shard.entries) {
          allProps.set(nodeId, props);
        }
      }
    }

    expect(allProps.get('A')).toEqual({ name: 'Alice' });
  });
});
