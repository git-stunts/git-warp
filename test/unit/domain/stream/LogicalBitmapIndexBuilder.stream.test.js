/**
 * Tests that LogicalBitmapIndexBuilder.yieldShards() produces output
 * equivalent to serialize() when piped through the encode pipeline.
 */
import { describe, it, expect } from 'vitest';
import LogicalBitmapIndexBuilder from '../../../../src/domain/services/index/LogicalBitmapIndexBuilder.js';
import WarpStream from '../../../../src/domain/stream/WarpStream.js';
import { IndexShardEncodeTransform } from '../../../../src/infrastructure/adapters/IndexShardEncodeTransform.js';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.js';
import { MetaShard, EdgeShard, LabelShard, ReceiptShard, IndexShard } from '../../../../src/domain/artifacts/IndexShard.js';

/**
 * Builds a small index with nodes and edges for testing.
 * @returns {LogicalBitmapIndexBuilder}
 */
function buildTestIndex() {
  const builder = new LogicalBitmapIndexBuilder();
  builder.registerNode('user:alice');
  builder.registerNode('user:bob');
  builder.registerNode('user:carol');
  builder.registerLabel('knows');
  builder.registerLabel('likes');
  builder.addEdge('user:alice', 'user:bob', 'knows');
  builder.addEdge('user:bob', 'user:carol', 'knows');
  builder.addEdge('user:alice', 'user:carol', 'likes');
  return builder;
}

describe('LogicalBitmapIndexBuilder.yieldShards() — IndexShard records', () => {
  it('yields IndexShard instances', () => {
    const builder = buildTestIndex();
    const shards = [...builder.yieldShards()];
    for (const shard of shards) {
      expect(shard).toBeInstanceOf(IndexShard);
    }
  });

  it('produces MetaShard, LabelShard, EdgeShard, ReceiptShard', () => {
    const builder = buildTestIndex();
    const shards = [...builder.yieldShards()];
    expect(shards.some((s) => s instanceof MetaShard)).toBe(true);
    expect(shards.some((s) => s instanceof LabelShard)).toBe(true);
    expect(shards.some((s) => s instanceof EdgeShard)).toBe(true);
    expect(shards.some((s) => s instanceof ReceiptShard)).toBe(true);
  });

  it('produces byte-identical output via IndexShardEncodeTransform', async () => {
    const codec = new CborCodec();
    const builder = buildTestIndex();

    // Old path: serialize() produces Record<string, Uint8Array>
    const serialized = builder.serialize();

    // New path: yieldShards() → IndexShardEncodeTransform → collect
    const streamed = await WarpStream.from(builder.yieldShards())
      .pipe(new IndexShardEncodeTransform(codec))
      .collect();

    // Convert both to hex maps for comparison
    /** @type {Record<string, string>} */
    const serializedHex = {};
    for (const [path, bytes] of Object.entries(serialized)) {
      serializedHex[path] = Array.from(bytes).map(
        (/** @type {number} */ b) => b.toString(16).padStart(2, '0'),
      ).join('');
    }

    /** @type {Record<string, string>} */
    const streamedHex = {};
    for (const [path, bytes] of streamed) {
      streamedHex[path] = Array.from(/** @type {Uint8Array} */ (bytes)).map(
        (/** @type {number} */ b) => b.toString(16).padStart(2, '0'),
      ).join('');
    }

    expect(streamedHex).toEqual(serializedHex);
  });

  it('ReceiptShard has correct counts', () => {
    const builder = buildTestIndex();
    const shards = [...builder.yieldShards()];
    const receipt = shards.find((s) => s instanceof ReceiptShard);
    expect(receipt).toBeInstanceOf(ReceiptShard);
    const r = /** @type {ReceiptShard} */ (receipt);
    expect(r.version).toBe(1);
    expect(r.nodeCount).toBe(3);
    expect(r.labelCount).toBe(2);
  });

  it('EdgeShards have correct directions', () => {
    const builder = buildTestIndex();
    const shards = [...builder.yieldShards()];
    const edgeShards = shards.filter((s) => s instanceof EdgeShard);
    const directions = edgeShards.map((s) => /** @type {EdgeShard} */ (s).direction);
    expect(directions).toContain('fwd');
    expect(directions).toContain('rev');
  });
});
