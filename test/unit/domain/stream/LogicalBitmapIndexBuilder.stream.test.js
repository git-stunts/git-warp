/**
 * Tests that LogicalBitmapIndexBuilder.yieldShards() produces output
 * equivalent to serialize() when piped through the encode pipeline.
 */
import { describe, it, expect } from 'vitest';
import LogicalBitmapIndexBuilder from '../../../../src/domain/services/index/LogicalBitmapIndexBuilder.js';
import WarpStream from '../../../../src/domain/stream/WarpStream.js';
import { CborEncodeTransform } from '../../../../src/infrastructure/adapters/CborEncodeTransform.js';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.js';

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

describe('LogicalBitmapIndexBuilder.yieldShards() stream equivalence', () => {
  it('produces the same paths as serialize()', () => {
    const builder = buildTestIndex();
    const serialized = builder.serialize();
    const yielded = [...builder.yieldShards()].map(([path]) => path);
    const serializedPaths = Object.keys(serialized).sort();
    yielded.sort();
    expect(yielded).toEqual(serializedPaths);
  });

  it('produces byte-identical output when piped through CborEncodeTransform', async () => {
    const codec = new CborCodec();
    const builder = buildTestIndex();

    // Old path: serialize() produces Record<string, Uint8Array>
    const serialized = builder.serialize();

    // New path: yieldShards() → CborEncodeTransform → collect
    const streamed = await WarpStream.from(builder.yieldShards())
      .pipe(new CborEncodeTransform(codec))
      .collect();

    // Convert to comparable maps
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

  it('yieldShards() includes receipt with correct counts', () => {
    const builder = buildTestIndex();
    const shards = [...builder.yieldShards()];
    const receipt = shards.find(([path]) => path === 'receipt.cbor');
    expect(receipt).toBeDefined();
    const [, data] = /** @type {[string, {version: number, nodeCount: number, labelCount: number}]} */ (receipt);
    expect(data.version).toBe(1);
    expect(data.nodeCount).toBe(3);
    expect(data.labelCount).toBe(2); // 'knows' and 'likes'
  });
});
