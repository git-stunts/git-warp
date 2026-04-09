/**
 * Tests that LogicalBitmapIndexBuilder.yieldShards() produces
 * IndexShard instances that can be piped through the encode pipeline.
 */
import { describe, it, expect } from 'vitest';
import LogicalBitmapIndexBuilder from '../../../../src/domain/services/index/LogicalBitmapIndexBuilder.js';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import { IndexShardEncodeTransform } from '../../../../src/infrastructure/adapters/IndexShardEncodeTransform.js';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.js';
import { IndexShard } from '../../../../src/domain/artifacts/IndexShard.ts';
import { MetaShard } from '../../../../src/domain/artifacts/MetaShard.ts';
import { EdgeShard } from '../../../../src/domain/artifacts/EdgeShard.ts';
import { LabelShard } from '../../../../src/domain/artifacts/LabelShard.ts';
import { ReceiptShard } from '../../../../src/domain/artifacts/ReceiptShard.ts';

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

  it('yieldShards piped through IndexShardEncodeTransform produces path-bytes pairs', async () => {
    const codec = new CborCodec();
    const builder = buildTestIndex();

    const streamed = await WarpStream.from(builder.yieldShards())
      .pipe(new IndexShardEncodeTransform(codec))
      .collect();

    // Every entry should be a [string, Uint8Array] pair
    for (const [path, bytes] of streamed) {
      expect(typeof path).toBe('string');
      expect(bytes).toBeInstanceOf(Uint8Array);
    }

    // Should contain expected path prefixes
    const paths = streamed.map(([path]) => path);
    expect(paths.some((p) => p.startsWith('meta_'))).toBe(true);
    expect(paths.some((p) => p.startsWith('fwd_'))).toBe(true);
    expect(paths.some((p) => p.startsWith('rev_'))).toBe(true);
    expect(paths.some((p) => p === 'labels.cbor')).toBe(true);
    expect(paths.some((p) => p === 'receipt.cbor')).toBe(true);
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
