import { describe, it, expect } from 'vitest';
import PropertyIndexBuilder from '../../../../src/domain/services/index/PropertyIndexBuilder.js';
import PropertyIndexReader from '../../../../src/domain/services/index/PropertyIndexReader.js';
import { PropertyShard } from '../../../../src/domain/artifacts/IndexShard.js';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.js';
import computeShardKey from '../../../../src/domain/utils/shardKey.js';
import { F10_PROTO_POLLUTION } from '../../../helpers/fixtureDsl.js';

const codec = new CborCodec();

/**
 * Creates an in-memory mock storage from PropertyShard instances.
 * Encodes each shard's entries via CBOR so PropertyIndexReader can decode them.
 */
/** @param {Array<PropertyShard>} shards */
function mockStorageFromShards(shards) {
  const blobs = new Map();
  /** @type {Record<string, string>} */
  const oids = {};
  let oidCounter = 0;

  for (const shard of shards) {
    const path = `props_${shard.shardKey}.cbor`;
    const oid = `oid_${oidCounter++}`;
    blobs.set(oid, codec.encode(shard.entries));
    oids[path] = oid;
  }

  return {
    storage: { readBlob: async (/** @type {string} */ oid) => blobs.get(oid) },
    oids,
  };
}

describe('PropertyIndex', () => {
  it('build → serialize → load → query matches', async () => {
    const builder = new PropertyIndexBuilder();
    builder.addProperty('user:alice', 'name', 'Alice');
    builder.addProperty('user:alice', 'age', 30);
    builder.addProperty('user:bob', 'name', 'Bob');

    const shards = /** @type {Array<PropertyShard>} */ ([...builder.yieldShards()]);
    const { storage, oids } = mockStorageFromShards(shards);

    const reader = new PropertyIndexReader({ storage });
    reader.setup(oids);

    const aliceProps = await reader.getNodeProps('user:alice');
    expect(aliceProps).toEqual({ name: 'Alice', age: 30 });

    const bobName = await reader.getProperty('user:bob', 'name');
    expect(bobName).toBe('Bob');
  });

  it('missing node returns null', async () => {
    const builder = new PropertyIndexBuilder();
    builder.addProperty('user:alice', 'name', 'Alice');

    const shards = /** @type {Array<PropertyShard>} */ ([...builder.yieldShards()]);
    const { storage, oids } = mockStorageFromShards(shards);

    const reader = new PropertyIndexReader({ storage });
    reader.setup(oids);

    expect(await reader.getNodeProps('nonexistent')).toBeNull();
    expect(await reader.getProperty('nonexistent', 'name')).toBeUndefined();
  });

  it('multiple nodes in same shard are correctly isolated', async () => {
    const builder = new PropertyIndexBuilder();
    const first = 'a';
    const shardKey = computeShardKey(first);
    let second = null;
    for (let i = 0; i < 10000; i++) {
      const candidate = `node:${i}`;
      if (candidate !== first && computeShardKey(candidate) === shardKey) {
        second = candidate;
        break;
      }
    }
    if (!second) {
      throw new Error('failed to find a same-shard node for test');
    }
    builder.addProperty(first, 'x', 1);
    builder.addProperty(second, 'y', 2);

    const shards = /** @type {Array<PropertyShard>} */ ([...builder.yieldShards()]);
    const { storage, oids } = mockStorageFromShards(shards);

    const reader = new PropertyIndexReader({ storage });
    reader.setup(oids);

    expect(await reader.getNodeProps(first)).toEqual({ x: 1 });
    expect(await reader.getNodeProps(second)).toEqual({ y: 2 });
  });

  it('round-trip: build → serialize → reader → values match', async () => {
    const builder = new PropertyIndexBuilder();
    builder.addProperty('node:1', 'color', 'red');
    builder.addProperty('node:1', 'weight', 42);
    builder.addProperty('node:2', 'color', 'blue');

    const shards = /** @type {Array<PropertyShard>} */ ([...builder.yieldShards()]);

    // Verify PropertyShard entries are well-formed objects
    for (const shard of shards) {
      expect(shard).toBeInstanceOf(PropertyShard);
      expect(Array.isArray(shard.entries)).toBe(true);
    }

    const { storage, oids } = mockStorageFromShards(shards);
    const reader = new PropertyIndexReader({ storage });
    reader.setup(oids);

    expect(await reader.getProperty('node:1', 'color')).toBe('red');
    expect(await reader.getProperty('node:1', 'weight')).toBe(42);
    expect(await reader.getProperty('node:2', 'color')).toBe('blue');
  });

  it('proto pollution safety (F10): __proto__ node props do not leak', async () => {
    const builder = new PropertyIndexBuilder();
    for (const { nodeId, key, value } of /** @type {*} */ (F10_PROTO_POLLUTION.props)) {
      builder.addProperty(nodeId, key, value);
    }

    const shards = /** @type {Array<PropertyShard>} */ ([...builder.yieldShards()]);
    const { storage, oids } = mockStorageFromShards(shards);

    const reader = new PropertyIndexReader({ storage });
    reader.setup(oids);

    const props = await reader.getNodeProps('__proto__');
    expect(props).toEqual({ polluted: true });
    expect((/** @type {Record<string, unknown>} */ ({}))['polluted']).toBeUndefined();
  });

  it('throws a descriptive error when a shard OID is missing', async () => {
    const reader = new PropertyIndexReader({
      storage: { readBlob: async () => undefined },
    });
    reader.setup({ 'props_ab.cbor': 'oid_missing' });
    const abNodeId = `ab${'0'.repeat(38)}`;

    await expect(reader.getNodeProps(abNodeId)).rejects.toThrow(/missing blob.*oid_missing/i);
  });

  it('throws when decoded shard payload is not an array', async () => {
    const abNodeId = `ab${'0'.repeat(38)}`;
    const shardPath = `props_${computeShardKey(abNodeId)}.cbor`;
    const reader = new PropertyIndexReader({
      storage: { readBlob: async () => codec.encode({ [abNodeId]: { name: 'Alice' } }) },
    });
    reader.setup({ [shardPath]: 'oid_bad_format' });

    await expect(reader.getNodeProps(abNodeId)).rejects.toThrow(/invalid shard format.*expected array.*object/i);
  });

  it('serializes deterministically for equivalent property sets across op orders', () => {
    const order1 = new PropertyIndexBuilder();
    order1.addProperty('node:alpha', 'name', 'Alice');
    order1.addProperty('node:beta', 'name', 'Bob');
    order1.addProperty('node:alpha', 'role', 'admin');
    order1.addProperty('node:beta', 'active', true);

    const order2 = new PropertyIndexBuilder();
    order2.addProperty('node:beta', 'active', true);
    order2.addProperty('node:alpha', 'role', 'admin');
    order2.addProperty('node:beta', 'name', 'Bob');
    order2.addProperty('node:alpha', 'name', 'Alice');

    const shards1 = /** @type {Array<PropertyShard>} */ ([...order1.yieldShards()]);
    const shards2 = /** @type {Array<PropertyShard>} */ ([...order2.yieldShards()]);

    // Same number of shards with same shard keys
    const keys1 = shards1.map((s) => s.shardKey).sort();
    const keys2 = shards2.map((s) => s.shardKey).sort();
    expect(keys1).toEqual(keys2);

    // Same entries per shard key
    for (const shard1 of shards1) {
      const shard2 = shards2.find((s) => s.shardKey === shard1.shardKey);
      expect(shard2).toBeDefined();
      expect(shard1.entries).toEqual(/** @type {PropertyShard} */ (shard2).entries);
    }
  });
});
