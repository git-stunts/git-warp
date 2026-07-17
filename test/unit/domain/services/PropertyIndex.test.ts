import { describe, expect, it } from 'vitest';
import { PropertyShard } from '../../../../src/domain/artifacts/PropertyShard.ts';
import PropertyIndexBuilder from '../../../../src/domain/services/index/PropertyIndexBuilder.ts';
import PropertyIndexReader from '../../../../src/domain/services/index/PropertyIndexReader.ts';
import { decodePropertyShard } from '../../../../src/domain/services/index/PropertyIndexReader.ts';
import {
  MAX_MATERIALIZATION_PROPERTY_SHARDS,
  requireMaterializationPropertyShardCount,
} from '../../../../src/domain/materialization/MaterializationPropertyProfile.ts';
import computeShardKey from '../../../../src/domain/utils/shardKey.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { F10_PROTO_POLLUTION } from '../../../helpers/fixtureDsl.ts';
import MockIndexStorage from '../../../helpers/MockIndexStorage.ts';

async function storedReader(builder: PropertyIndexBuilder): Promise<PropertyIndexReader> {
  const storage = new MockIndexStorage();
  const handles = {} as Record<string, Awaited<ReturnType<MockIndexStorage['writeBlob']>>>;
  for (const shard of builder.yieldShards()) {
    handles[`props_${shard.shardKey}.cbor`] = await storage.writeBlob(
      defaultCodec.encode(shard.entries),
    );
  }
  const reader = new PropertyIndexReader({ indexStore: storage });
  reader.setupHandles(handles);
  return reader;
}

describe('PropertyIndex handle-backed reads', () => {
  it('builds, stores, and queries property shards through opaque handles', async () => {
    const builder = new PropertyIndexBuilder();
    builder.addProperty('user:alice', 'name', 'Alice');
    builder.addProperty('user:alice', 'age', 30);
    builder.addProperty('user:bob', 'name', 'Bob');
    const reader = await storedReader(builder);

    await expect(reader.getNodeProps('user:alice')).resolves.toEqual({ name: 'Alice', age: 30 });
    await expect(reader.getProperty('user:bob', 'name')).resolves.toBe('Bob');
    await expect(reader.getProperty('user:alice', 'constructor')).resolves.toBeUndefined();
    await expect(reader.getProperty('user:alice', 'toString')).resolves.toBeUndefined();
    await expect(reader.getNodeProps('missing')).resolves.toBeNull();
    await expect(reader.getProperty('missing', 'name')).resolves.toBeUndefined();
  });

  it('reads freshly materialized in-memory shards without a storage adapter', async () => {
    const builder = new PropertyIndexBuilder();
    builder.addProperty('node:1', 'color', 'red');
    const tree: Record<string, Uint8Array> = {};
    for (const shard of builder.yieldShards()) {
      tree[`props_${shard.shardKey}.cbor`] = defaultCodec.encode(shard.entries);
    }
    const reader = new PropertyIndexReader({ codec: defaultCodec });
    reader.setupTree(tree);

    await expect(reader.getProperty('node:1', 'color')).resolves.toBe('red');
  });

  it('keeps nodes isolated when they share one shard', async () => {
    const first = 'a';
    const shardKey = computeShardKey(first);
    const second = Array.from({ length: 10_000 }, (_, index) => `node:${index}`)
      .find((candidate) => candidate !== first && computeShardKey(candidate) === shardKey);
    if (second === undefined) {
      throw new Error('failed to find a same-shard node');
    }
    const builder = new PropertyIndexBuilder();
    builder.addProperty(first, 'x', 1);
    builder.addProperty(second, 'y', 2);
    const reader = await storedReader(builder);

    await expect(reader.getNodeProps(first)).resolves.toEqual({ x: 1 });
    await expect(reader.getNodeProps(second)).resolves.toEqual({ y: 2 });
  });

  it('fails when handle-backed reads have no index store', async () => {
    const storage = new MockIndexStorage();
    const handle = await storage.writeBlob(defaultCodec.encode([]));
    const reader = new PropertyIndexReader();
    reader.setupHandles({ [`props_${computeShardKey('node:1')}.cbor`]: handle });

    await expect(reader.getNodeProps('node:1')).rejects.toMatchObject({ code: 'E_INDEX_NO_STORE' });
  });

  it('rejects malformed decoded shard payloads', async () => {
    const storage = new MockIndexStorage();
    const handle = await storage.writeBlob(defaultCodec.encode({ invalid: true }));
    const reader = new PropertyIndexReader({ indexStore: storage });
    reader.setupHandles({ [`props_${computeShardKey('node:1')}.cbor`]: handle });

    await expect(reader.getNodeProps('node:1')).rejects.toMatchObject({
      code: 'E_INDEX_SHARD_MALFORMED',
    });
  });

  it('rejects duplicate and wrong-bucket node entries', () => {
    const nodeId = 'node:1';
    const path = `props_${computeShardKey(nodeId)}.cbor`;

    expect(() => decodePropertyShard([
      [nodeId, { status: 'first' }],
      [nodeId, { status: 'second' }],
    ], path)).toThrowError(expect.objectContaining({ code: 'E_INDEX_SHARD_MALFORMED' }));
    expect(() => decodePropertyShard(
      [[nodeId, { status: 'misbucketed' }]],
      'props_00.cbor',
    )).toThrowError(expect.objectContaining({ code: 'E_INDEX_SHARD_MALFORMED' }));
  });

  it('decodes schema-v1 object bags and schema-v2 entry bags explicitly', () => {
    const nodeId = 'node:1';
    const path = `props_${computeShardKey(nodeId)}.cbor`;
    const legacy = decodePropertyShard([[nodeId, { status: 'legacy' }]], path);
    const current = decodePropertyShard({
      schemaVersion: 2,
      entries: [[nodeId, [[
        '__proto__',
        'retained-data',
      ], [
        'status',
        'current',
      ]]]],
    }, path);
    const currentBag = current.get(nodeId);

    expect(legacy.get(nodeId)).toEqual({ status: 'legacy' });
    expect(currentBag?.['status']).toBe('current');
    expect(Object.hasOwn(currentBag ?? {}, '__proto__')).toBe(true);
    expect(currentBag?.['__proto__']).toBe('retained-data');
    expect(Object.getPrototypeOf(currentBag)).toBeNull();
    expect(Object.isFrozen(currentBag)).toBe(true);
    expect(({} as Record<string, unknown>)['retained-data']).toBeUndefined();
  });

  it('rejects ambiguous, duplicate, and invalid schema-v2 property entries', () => {
    const nodeId = 'node:1';
    const path = `props_${computeShardKey(nodeId)}.cbor`;

    for (const payload of [
      null,
      { schemaVersion: 2, entries: [[nodeId, [['status', 'first'], ['status', 'second']]]] },
      { schemaVersion: 2, entries: [[nodeId, [['', 'empty-key']]]] },
      { schemaVersion: 2, entries: [[nodeId, [['bad\0key', 'nul-key']]]] },
      { schemaVersion: 2, entries: [[nodeId, { status: 'object-bag' }]] },
      { schemaVersion: 2, entries: 'not-an-array' },
      { schemaVersion: 2, entries: [['', []]] },
      { schemaVersion: 3, entries: [] },
      { schemaVersion: 2, entries: [], extra: true },
    ]) {
      expect(() => decodePropertyShard(payload, path)).toThrowError(
        expect.objectContaining({ code: 'E_INDEX_SHARD_MALFORMED' }),
      );
    }

    expect(() => decodePropertyShard(
      [[nodeId, [['status', 'ambiguous-v1-array-bag']]]],
      path,
    )).toThrowError(expect.objectContaining({ code: 'E_INDEX_SHARD_MALFORMED' }));
  });

  it('uses an injected shard routing profile without changing the default profile', () => {
    const builder = new PropertyIndexBuilder({ shardKey: () => 'custom' });
    builder.addProperty('node:1', 'status', 'ready');

    expect([...builder.yieldShards()].map((shard) => shard.shardKey)).toEqual(['custom']);
    expect(computeShardKey('node:1')).not.toBe('custom');
  });

  it('rejects an over-limit flat property root before persistence', () => {
    expect(() => requireMaterializationPropertyShardCount(
      MAX_MATERIALIZATION_PROPERTY_SHARDS + 1,
    )).toThrowError(expect.objectContaining({ code: 'E_INDEX_SHARD_COUNT_LIMIT' }));
  });

  it('does not permit __proto__ property data to mutate Object.prototype', async () => {
    const builder = new PropertyIndexBuilder();
    for (const { nodeId, key, value } of F10_PROTO_POLLUTION.props) {
      builder.addProperty(nodeId, key, value);
    }
    const reader = await storedReader(builder);

    await expect(reader.getNodeProps('__proto__')).resolves.toEqual({ polluted: true });
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('serializes equivalent property sets deterministically across operation order', () => {
    const first = new PropertyIndexBuilder();
    first.addProperty('node:alpha', 'name', 'Alice');
    first.addProperty('node:beta', 'name', 'Bob');
    first.addProperty('node:alpha', 'role', 'admin');
    const second = new PropertyIndexBuilder();
    second.addProperty('node:alpha', 'role', 'admin');
    second.addProperty('node:beta', 'name', 'Bob');
    second.addProperty('node:alpha', 'name', 'Alice');

    const firstShards = [...first.yieldShards()] as PropertyShard[];
    const secondShards = [...second.yieldShards()] as PropertyShard[];
    expect(firstShards).toEqual(secondShards);
    expect(firstShards.map((shard) => defaultCodec.encode(shard.entries)))
      .toEqual(secondShards.map((shard) => defaultCodec.encode(shard.entries)));
  });
});
