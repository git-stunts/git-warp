import { describe, it, expect } from 'vitest';
import LogicalIndexBuildService from '../../../../src/domain/services/index/LogicalIndexBuildService.ts';
import { createEmptyState, applyOpV2 } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import { MetaShard } from '../../../../src/domain/artifacts/MetaShard.ts';
import { LabelShard } from '../../../../src/domain/artifacts/LabelShard.ts';
import { EdgeShard } from '../../../../src/domain/artifacts/EdgeShard.ts';

/**
 * Helper: builds a WarpState from nodes and edges, applying ops in the
 * given order. Different orderings of the same final state should produce
 * identical index mappings after the determinism sort fix.
 *
 * @param {string[]} nodes
 * @param {Array<{from: string, to: string, label: string}>} edges
 */
function buildState(nodes, edges) {
  const state = createEmptyState();
  const writer = 'w1';
  const sha = 'a'.repeat(40);
  let opIdx = 0;
  let lamport = 1;

  for (const nodeId of nodes) {
    applyOpV2(state,
      { type: 'NodeAdd', node: nodeId, dot: Dot.create(writer, lamport) },
      new EventId(lamport, writer, sha, opIdx++));
    lamport++;
  }

  for (const { from, to, label } of edges) {
    applyOpV2(state,
      { type: 'EdgeAdd', from, to, label, dot: Dot.create(writer, lamport) },
      new EventId(lamport, writer, sha, opIdx++));
    lamport++;
  }

  return state;
}

/**
 * Extracts nodeToGlobal mappings from all MetaShards.
 *
 * @param {import('../../../../src/domain/artifacts/IndexShard.js').IndexShard[]} shards
 * @returns {Map<string, number>}
 */
function extractNodeMappings(shards) {
  const mappings = new Map();
  for (const shard of shards) {
    if (shard instanceof MetaShard) {
      for (const [nodeId, globalId] of shard.nodeToGlobal) {
        mappings.set(nodeId, globalId);
      }
    }
  }
  return mappings;
}

/**
 * Extracts label registry from shards.
 *
 * @param {import('../../../../src/domain/artifacts/IndexShard.js').IndexShard[]} shards
 * @returns {Array<[string, number]>}
 */
function extractLabelRegistry(shards) {
  const labelShard = shards.find((s) => s instanceof LabelShard);
  if (!labelShard) { return []; }
  return (labelShard).labels;
}

/**
 * Extracts edge shard payloads keyed by direction+shardKey.
 *
 * @param {import('../../../../src/domain/artifacts/IndexShard.js').IndexShard[]} shards
 * @returns {Record<string, Record<string, Record<string, Uint8Array>>>}
 */
function extractEdgeShards(shards) {
    const out = ({}) as Record<string, Record<string, Record<string, Uint8Array>>>;
  for (const shard of shards) {
    if (shard instanceof EdgeShard) {
      out[`${shard.direction}_${shard.shardKey}`] = shard.buckets;
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

  it('same state from different node insertion orders produces identical ID assignments', async () => {
    // Order 1: A, B, C
    const state1 = buildState(['A', 'B', 'C'], edges);
    // Order 2: C, A, B (different insertion order, same final OR-Set)
    const state2 = buildState(['C', 'A', 'B'], edges);

    const service = new LogicalIndexBuildService();
    const shards1 = await service.buildStream(state1).stream.collect();
    const shards2 = await service.buildStream(state2).stream.collect();

    const mappings1 = extractNodeMappings(shards1);
    const mappings2 = extractNodeMappings(shards2);

    // Both should have the same nodeId → globalId assignments
    expect(mappings1.size).toBe(3);
    expect(mappings2.size).toBe(3);
    for (const [nodeId, globalId] of mappings1) {
      expect(mappings2.get(nodeId)).toBe(globalId);
    }
  });

  it('same state from different edge insertion orders produces identical label assignments', async () => {
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
    const shards1 = await service.buildStream(state1).stream.collect();
    const shards2 = await service.buildStream(state2).stream.collect();

    const labels1 = extractLabelRegistry(shards1);
    const labels2 = extractLabelRegistry(shards2);

    // Both should have the same label → labelId assignments
    expect(labels1).toEqual(labels2);
  });

  it('meta shard nodeToGlobal pairs are sorted by nodeId (forced same-shard IDs)', async () => {
    const sameShardNodes = [
      `aa${'0'.repeat(38)}`,
      `aa${'1'.repeat(38)}`,
      `aa${'2'.repeat(38)}`,
      `aa${'3'.repeat(38)}`,
    ];
    const state = buildState(sameShardNodes, []);

    const service = new LogicalIndexBuildService();
    const shards = await service.buildStream(state).stream.collect();

    const metaAA = shards.find((s) => s instanceof MetaShard && s.shardKey === 'aa');
    expect(metaAA).toBeDefined();
    const nodeIds = (metaAA).nodeToGlobal.map(
      (/** @type {[string, number]} */ pair) => pair[0],
    );
    expect(nodeIds.length).toBe(4);
    expect(nodeIds).toEqual([...nodeIds].sort());
  });

  it('same state from different edge insertion orders produces identical edge shard payloads', async () => {
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
    const shards1 = await service.buildStream(state1).stream.collect();
    const shards2 = await service.buildStream(state2).stream.collect();

    expect(extractEdgeShards(shards1)).toEqual(extractEdgeShards(shards2));
  });
});
