import { describe, it, expect } from 'vitest';
import LogicalBitmapIndexBuilder from '../../../../src/domain/services/LogicalBitmapIndexBuilder.js';
import { ShardIdOverflowError } from '../../../../src/domain/errors/index.js';
import { F12_STABLE_IDS } from '../../../helpers/fixtureDsl.js';
import computeShardKey from '../../../../src/domain/utils/shardKey.js';
import defaultCodec from '../../../../src/domain/utils/defaultCodec.js';

/**
 * @param {Uint8Array} buf
 * @returns {Record<string, number>}
 */
function decodeLabelRegistry(buf) {
  const decoded = /** @type {Record<string, number>|Array<[string, number]>} */ (defaultCodec.decode(buf));
  const entries = Array.isArray(decoded) ? decoded : Object.entries(decoded);
  /** @type {Record<string, number>} */
  const out = {};
  for (const [label, id] of entries) {
    out[label] = id;
  }
  return out;
}

describe('LogicalBitmapIndexBuilder ID stability (F12)', () => {
  it('existing node IDs are preserved across rebuild', () => {
    const { initialNodes, addedNodes } = F12_STABLE_IDS;

    // Build 1: register initial nodes
    const builder1 = new LogicalBitmapIndexBuilder();
    /** @type {Record<string, number>} */
    const initialIds = {};
    for (const node of initialNodes) {
      initialIds[node] = builder1.registerNode(node);
    }
    const tree1 = builder1.serialize();

    // Extract meta shards for each shardKey used (proto-safe decode)
    /** @type {Record<string, *>} */
    const metaShards = {};
    for (const [path, buf] of Object.entries(tree1)) {
      if (path.startsWith('meta_') && path.endsWith('.cbor')) {
        const shardKey = path.slice(5, 7);
        const decoded = defaultCodec.decode(buf);
        metaShards[shardKey] = decoded;
      }
    }

    // Build 2: seed from build 1, then add new nodes
    const builder2 = new LogicalBitmapIndexBuilder();
    for (const [shardKey, meta] of Object.entries(metaShards)) {
      builder2.loadExistingMeta(shardKey, meta);
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
      const err = /** @type {*} */ (_e);
      expect(err.code).toBe('E_SHARD_ID_OVERFLOW');
      expect(err.context.shardKey).toBe(shardKey);
    }
  });

  it('label registry is append-only across rebuilds', () => {
    const builder1 = new LogicalBitmapIndexBuilder();
    const managesId = builder1.registerLabel('manages');
    const ownsId = builder1.registerLabel('owns');
    expect(managesId).toBe(0);
    expect(ownsId).toBe(1);

    const tree1 = builder1.serialize();
    const labelRegistry = decodeLabelRegistry(/** @type {Uint8Array} */ (tree1['labels.cbor']));

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
    const seededTree = seedBuilder.serialize();
    const seededMeta = /** @type {{ nodeToGlobal: Array<[string, number]>, nextLocalId: number }} */ (
      defaultCodec.decode(/** @type {Uint8Array} */ (seededTree['meta_aa.cbor']))
    );

    const rebuild = new LogicalBitmapIndexBuilder();
    rebuild.loadExistingMeta('aa', seededMeta);
    for (const nodeId of shardNodes) {
      rebuild.registerNode(nodeId);
    }

    const rebuiltTree = rebuild.serialize();
    const rebuiltMeta = /** @type {{ nodeToGlobal: Array<[string, number]> }} */ (
      defaultCodec.decode(/** @type {Uint8Array} */ (rebuiltTree['meta_aa.cbor']))
    );
    const nodeIds = rebuiltMeta.nodeToGlobal.map(([nodeId]) => nodeId);
    const uniqueNodeIds = new Set(nodeIds);

    expect(nodeIds.length).toBe(shardNodes.length);
    expect(uniqueNodeIds.size).toBe(shardNodes.length);
    expect([...uniqueNodeIds].sort()).toEqual([...shardNodes].sort());
  });
});
