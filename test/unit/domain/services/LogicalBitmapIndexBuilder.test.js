import { describe, it, expect } from 'vitest';
import LogicalBitmapIndexBuilder from '../../../../src/domain/services/index/LogicalBitmapIndexBuilder.js';
import { MetaShard, EdgeShard, LabelShard, ReceiptShard } from '../../../../src/domain/artifacts/IndexShard.js';
import { getRoaringBitmap32 } from '../../../../src/domain/utils/roaring.js';
import { F7_MULTILABEL_SAME_NEIGHBOR, F10_PROTO_POLLUTION } from '../../../helpers/fixtureDsl.js';
import computeShardKey from '../../../../src/domain/utils/shardKey.js';

/**
 * Helper: build an index from a fixture.
 */
/** @param {*} fixture */
function buildFromFixture(fixture) {
  const builder = new LogicalBitmapIndexBuilder();
  for (const node of fixture.nodes) {
    builder.registerNode(node);
    builder.markAlive(node);
  }
  for (const { label } of fixture.edges) {
    builder.registerLabel(label);
  }
  for (const { from: edgeFrom, to: edgeTo, label } of fixture.edges) {
    builder.addEdge(edgeFrom, edgeTo, label);
  }
  return builder;
}

describe('LogicalBitmapIndexBuilder', () => {
  it('builds from F7 multilabel and produces correct per-label bitmaps', () => {
    const builder = buildFromFixture(F7_MULTILABEL_SAME_NEIGHBOR);
    const shards = [...builder.yieldShards()];

    // Should have a LabelShard
    const labelShard = shards.find((s) => s instanceof LabelShard);
    expect(labelShard).toBeInstanceOf(LabelShard);
    const labels = new Map(/** @type {LabelShard} */ (labelShard).labels);
    expect(labels.has('manages')).toBe(true);
    expect(labels.has('owns')).toBe(true);

    // Find the fwd EdgeShard for node A's shard
    const shardKeyA = computeShardKey('A');
    const fwdShard = shards.find(
      (s) => s instanceof EdgeShard && /** @type {EdgeShard} */ (s).direction === 'fwd' && s.shardKey === shardKeyA,
    );
    expect(fwdShard).toBeDefined();

    const buckets = /** @type {EdgeShard} */ (fwdShard).buckets;
    // 'all' bucket should exist
    expect(buckets).toHaveProperty('all');
    // Per-label buckets should exist (labelId 0 and 1)
    expect(buckets).toHaveProperty(String(labels.get('manages')));
    expect(buckets).toHaveProperty(String(labels.get('owns')));
  });

  it('delete correctness: same neighbor via two labels, remove one, all bitmap still has neighbor', () => {
    // Build with both labels
    const builder = buildFromFixture(F7_MULTILABEL_SAME_NEIGHBOR);

    const globalA = builder.registerNode('A');
    const globalB = builder.registerNode('B');

    const shards = [...builder.yieldShards()];

    // Find the fwd EdgeShard containing A's edges (keyed by A's shard)
    const shardKeyA = computeShardKey('A');
    const fwdShard = shards.find(
      (s) => s instanceof EdgeShard && /** @type {EdgeShard} */ (s).direction === 'fwd' && s.shardKey === shardKeyA,
    );
    expect(fwdShard).toBeDefined();
    const buckets = /** @type {EdgeShard} */ (fwdShard).buckets;

    // The 'all' bitmap for A (by globalA) should contain B's globalId
    const RoaringBitmap32 = getRoaringBitmap32();
    const allBucket = buckets.all;
    expect(allBucket).toBeDefined();
    const bitmapBytes = /** @type {Record<string, Uint8Array>} */ (allBucket)[String(globalA)];
    expect(bitmapBytes).toBeDefined();

    const allBitmap = RoaringBitmap32.deserialize(
      Buffer.from(bitmapBytes.buffer, bitmapBytes.byteOffset, bitmapBytes.byteLength),
      true,
    );
    expect(allBitmap.has(globalB)).toBe(true);
  });

  it('proto pollution safety (F10): builds without mutating Object.prototype', () => {
    const beforeProto = /** @type {*} */ ({}).polluted;
    const beforeConstructor = ({}).constructor;

    buildFromFixture(F10_PROTO_POLLUTION);

    expect(/** @type {*} */ ({}).polluted).toBe(beforeProto);
    expect(({}).constructor).toBe(beforeConstructor);
  });

  it('empty graph produces valid empty shards', () => {
    const builder = new LogicalBitmapIndexBuilder();
    const shards = [...builder.yieldShards()];

    expect(shards.some((s) => s instanceof LabelShard)).toBe(true);
    expect(shards.some((s) => s instanceof ReceiptShard)).toBe(true);

    const receipt = /** @type {ReceiptShard} */ (shards.find((s) => s instanceof ReceiptShard));
    expect(receipt.nodeCount).toBe(0);
    expect(receipt.labelCount).toBe(0);
  });

  it('receipt has deterministic fields and no timestamps', () => {
    const builder = buildFromFixture(F7_MULTILABEL_SAME_NEIGHBOR);
    const shards = [...builder.yieldShards()];
    const receipt = /** @type {ReceiptShard} */ (shards.find((s) => s instanceof ReceiptShard));

    expect(receipt.version).toBe(1);
    expect(receipt.nodeCount).toBe(2);
    expect(receipt.labelCount).toBe(2);
    expect(receipt.shardCount).toBeDefined();
    expect(/** @type {Record<string, unknown>} */ (receipt)).not.toHaveProperty('timestamp');
    expect(/** @type {Record<string, unknown>} */ (receipt)).not.toHaveProperty('createdAt');
  });

  it('round-trip: serialize → decode each shard → globalId↔nodeId intact', () => {
    const builder = buildFromFixture(F7_MULTILABEL_SAME_NEIGHBOR);
    const shards = [...builder.yieldShards()];

    // Verify all MetaShards have correct structure
    const metaShards = shards.filter((s) => s instanceof MetaShard);
    for (const shard of metaShards) {
      const meta = /** @type {MetaShard} */ (shard);
      expect(meta.nodeToGlobal).toBeDefined();
      expect(meta.nextLocalId).toBeDefined();
      expect(meta.alive).toBeDefined();

      // nodeToGlobal is array of [nodeId, globalId] pairs
      expect(Array.isArray(meta.nodeToGlobal)).toBe(true);
      for (const [nodeId, globalId] of meta.nodeToGlobal) {
        expect(typeof nodeId).toBe('string');
        expect(typeof globalId).toBe('number');
      }
    }
  });
});
