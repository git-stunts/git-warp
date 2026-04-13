import { describe, it, expect } from 'vitest';
import LogicalBitmapIndexBuilder from '../../../../src/domain/services/index/LogicalBitmapIndexBuilder.ts';
import { ShardIdOverflowError } from '../../../../src/domain/errors/index.ts';
import { MetaShard } from '../../../../src/domain/artifacts/MetaShard.ts';
import { LabelShard } from '../../../../src/domain/artifacts/LabelShard.ts';
import { F12_STABLE_IDS } from '../../../helpers/fixtureDsl.js';
import computeShardKey from '../../../../src/domain/utils/shardKey.ts';

describe('LogicalBitmapIndexBuilder ID stability (F12)', () => {
  it('existing node IDs are preserved across rebuild', () => {
    const { initialNodes, addedNodes } = F12_STABLE_IDS;

    // Build 1: register initial nodes
    const builder1 = new LogicalBitmapIndexBuilder();
        const initialIds = ({}) as Record<string, number>;
    for (const node of initialNodes) {
      initialIds[node] = builder1.registerNode(node);
    }
    const shards1 = [...builder1.yieldShards()];

    // Extract MetaShards keyed by shardKey
    /** @type {Record<string, { nodeToGlobal: Array<[string, number]>, nextLocalId: number }>} */
    const metaShards = {};
    for (const shard of shards1) {
      if (shard instanceof MetaShard) {
        metaShards[shard.shardKey] = {
          nodeToGlobal: shard.nodeToGlobal,
          nextLocalId: shard.nextLocalId,
        };
      }
    }

    // Build 2: seed from build 1, then add new nodes
    const builder2 = new LogicalBitmapIndexBuilder();
    for (const [shardKey, meta] of Object.entries(metaShards)) {
      builder2.loadExistingMeta(shardKey, meta as any);
    }
    for (const node of addedNodes) {
      builder2.registerNode(node);
    }

    // Verify: initial node IDs unchanged
    for (const node of initialNodes) {
      expect(builder2.registerNode(node)).toBe(initialIds[node]);
    }

    // Verify: added nodes got new IDs (not colliding with initial)
    const allIds = new Set(Object.values(initialIds));
    for (const node of addedNodes) {
      const id = builder2.registerNode(node);
      expect(allIds.has(id)).toBe(false);
      allIds.add(id);
    }
  });

  it('throws ShardIdOverflowError when shard is full', () => {
    const builder = new LogicalBitmapIndexBuilder();

    // Seed a shard with nextLocalId at 2^24 (F12.overflowNextLocalId)
    const testNode = 'A';
    const shardKey = computeShardKey(testNode);
    builder.loadExistingMeta(shardKey, {
      nodeToGlobal: {},
      nextLocalId: F12_STABLE_IDS.overflowNextLocalId,
    });

    expect(() => builder.registerNode(testNode)).toThrow(ShardIdOverflowError);
    try {
      builder.registerNode(testNode);
    } catch (_e) {
      const err = (_e);
      expect((err as any).code).toBe('E_SHARD_ID_OVERFLOW');
      expect((err as any).context.shardKey).toBe(shardKey);
    }
  });

  it('label registry is append-only across rebuilds', () => {
    const builder1 = new LogicalBitmapIndexBuilder();
    const managesId = builder1.registerLabel('manages');
    const ownsId = builder1.registerLabel('owns');
    expect(managesId).toBe(0);
    expect(ownsId).toBe(1);

    const shards1 = [...builder1.yieldShards()];
    const labelShard = (shards1.find((s) => s instanceof LabelShard) as LabelShard);
    const labelRegistry = Object.fromEntries(labelShard.labels);

    // Build 2: seed existing labels, add new
    const builder2 = new LogicalBitmapIndexBuilder();
    builder2.loadExistingLabels(labelRegistry);
    const likesId = builder2.registerLabel('likes');

    // Old labels keep their IDs
    expect(builder2.registerLabel('manages')).toBe(0);
    expect(builder2.registerLabel('owns')).toBe(1);
    // New label gets next ID
    expect(likesId).toBe(2);
  });

  it('does not duplicate shard node mappings after loadExistingMeta + registerNode', () => {
    const shardNodes = [
      `aa${'0'.repeat(38)}`,
      `aa${'1'.repeat(38)}`,
      `aa${'2'.repeat(38)}`,
    ];

    const seedBuilder = new LogicalBitmapIndexBuilder();
    for (const nodeId of shardNodes) {
      seedBuilder.registerNode(nodeId);
      seedBuilder.markAlive(nodeId);
    }
    const seededShards = [...seedBuilder.yieldShards()];
    const seededMeta = ((seededShards.find((s) => s instanceof MetaShard && s.shardKey === 'aa')) as MetaShard);

    const rebuild = new LogicalBitmapIndexBuilder();
    rebuild.loadExistingMeta('aa', {
      nodeToGlobal: seededMeta.nodeToGlobal,
      nextLocalId: seededMeta.nextLocalId,
    });
    for (const nodeId of shardNodes) {
      rebuild.registerNode(nodeId);
    }

    const rebuiltShards = [...rebuild.yieldShards()];
    const rebuiltMeta = ((rebuiltShards.find((s) => s instanceof MetaShard && s.shardKey === 'aa')) as MetaShard);
    const nodeIds = rebuiltMeta.nodeToGlobal.map(([nodeId]) => nodeId);
    const uniqueNodeIds = new Set(nodeIds);

    expect(nodeIds.length).toBe(shardNodes.length);
    expect(uniqueNodeIds.size).toBe(shardNodes.length);
    expect([...uniqueNodeIds].sort()).toEqual([...shardNodes].sort());
  });
});
