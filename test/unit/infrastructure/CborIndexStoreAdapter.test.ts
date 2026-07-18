import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BundleHandle as GitCasBundleHandle,
  PageHandle as GitCasPageHandle,
} from '@git-stunts/git-cas';
import { EdgeShard } from '../../../src/domain/artifacts/EdgeShard.ts';
import { IndexShard } from '../../../src/domain/artifacts/IndexShard.ts';
import { LabelShard } from '../../../src/domain/artifacts/LabelShard.ts';
import { MetaShard } from '../../../src/domain/artifacts/MetaShard.ts';
import { PropertyShard } from '../../../src/domain/artifacts/PropertyShard.ts';
import { ReceiptShard } from '../../../src/domain/artifacts/ReceiptShard.ts';
import AssetHandle from '../../../src/domain/storage/AssetHandle.ts';
import BundleHandle from '../../../src/domain/storage/BundleHandle.ts';
import WarpStream from '../../../src/domain/stream/WarpStream.ts';
import { collectAsyncIterable } from '../../../src/domain/utils/streamUtils.ts';
import computeShardKey from '../../../src/domain/utils/shardKey.ts';
import { materializationPropertyShardKey } from '../../../src/domain/materialization/MaterializationPropertyProfile.ts';
import {
  CborIndexStoreAdapter,
  type GitCasIndexFacade,
} from '../../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import {
  validateBoundedCbor,
  type CborStructureLimits,
} from '../../../src/infrastructure/adapters/BoundedCborValidation.ts';
import GitCasAssetStorageAdapter from '../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import { IndexShardEncodeTransform } from '../../../src/infrastructure/adapters/IndexShardEncodeTransform.ts';
import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import IndexStorePort from '../../../src/ports/IndexStorePort.ts';
import InMemoryGraphAdapter from '../../helpers/InMemoryGraphAdapter.ts';
import InMemoryBlobStorageAdapter from '../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../helpers/InMemoryGitCasFacade.ts';

const CBOR_STRUCTURE_LIMITS: CborStructureLimits = Object.freeze({
  maxContainerEntries: 100,
  maxDepth: 10,
  maxItems: 100,
});

function shards() {
  return [
    new MetaShard({
      shardKey: 'a0',
      nodeToGlobal: [['node:1', 0], ['node:2', 1]],
      nextLocalId: 2,
      alive: new Uint8Array([0xff]),
    }),
    new EdgeShard({
      shardKey: 'a0',
      direction: 'fwd',
      buckets: { all: { '0': new Uint8Array([0x01]) } },
    }),
    new EdgeShard({
      shardKey: 'a0',
      direction: 'rev',
      buckets: { all: { '1': new Uint8Array([0x02]) } },
    }),
    new LabelShard({ labels: [['manages', 0], ['owns', 1]] }),
    new PropertyShard({
      shardKey: computeShardKey('node:1'),
      entries: [['node:1', { name: 'Alice' }]],
    }),
    new ReceiptShard({ version: 1, nodeCount: 2, labelCount: 2, shardCount: 5 }),
  ];
}

describe('CborIndexStoreAdapter opaque shard boundary', () => {
  let history: InMemoryGraphAdapter;
  let backing: InMemoryBlobStorageAdapter;
  let cas: InMemoryGitCasFacade;
  let assets: GitCasAssetStorageAdapter;
  let indexes: CborIndexStoreAdapter;

  beforeEach(() => {
    history = new InMemoryGraphAdapter();
    backing = new InMemoryBlobStorageAdapter();
    cas = new InMemoryGitCasFacade({ history, storage: backing });
    assets = new GitCasAssetStorageAdapter({ cas, legacyReader: history });
    indexes = new CborIndexStoreAdapter({
      codec: defaultCodec,
      assetStorage: assets,
      cas,
    });
  });

  it('is an IndexStorePort and validates infrastructure dependencies', () => {
    expect(indexes).toBeInstanceOf(IndexStorePort);
    expect(() => new CborIndexStoreAdapter({
      // @ts-expect-error Runtime dependency guard for JavaScript callers.
      codec: null,
      assetStorage: assets,
      cas,
    })).toThrow(/codec/);
    expect(() => new CborIndexStoreAdapter({
      codec: defaultCodec,
      // @ts-expect-error Runtime dependency guard for JavaScript callers.
      assetStorage: null,
      cas,
    })).toThrow(/assetStorage/);
    expect(() => new CborIndexStoreAdapter({
      codec: defaultCodec,
      assetStorage: assets,
      // @ts-expect-error Runtime dependency guard for JavaScript callers.
      cas: null,
    })).toThrow(/cas/);
  });

  it('rejects an invalid encoder dependency and unsupported shard class', async () => {
    expect(() => new IndexShardEncodeTransform(
      // @ts-expect-error Runtime dependency guard for JavaScript callers.
      null,
    )).toThrowError(expect.objectContaining({ code: 'E_INVALID_DEPENDENCY' }));

    const encoded = WarpStream.from<IndexShard>([
      new IndexShard({ shardKey: 'unsupported', schemaVersion: 1 }),
    ]).pipe(new IndexShardEncodeTransform(defaultCodec));
    await expect(encoded.collect()).rejects.toMatchObject({ code: 'E_UNKNOWN_SHARD' });
  });

  it('writes and scans every supported shard class through one index handle', async () => {
    const indexHandle = await indexes.writeShards(WarpStream.from(shards()));
    const recovered = await indexes.scanShards(indexHandle).collect();

    expect(indexHandle).toBeInstanceOf(BundleHandle);
    expect(recovered).toHaveLength(6);
    expect(recovered.some((shard) => shard instanceof MetaShard)).toBe(true);
    expect(recovered.some((shard) => shard instanceof EdgeShard && shard.direction === 'fwd')).toBe(true);
    expect(recovered.some((shard) => shard instanceof EdgeShard && shard.direction === 'rev')).toBe(true);
    expect(recovered.some((shard) => shard instanceof LabelShard)).toBe(true);
    expect(recovered.some((shard) => shard instanceof PropertyShard)).toBe(true);
    expect(recovered.some((shard) => shard instanceof ReceiptShard)).toBe(true);
  });

  it('round-trips schema-v2 property entry bags without interpreting property names', async () => {
    const shardKey = materializationPropertyShardKey('node:1');
    const properties = Object.create(null) as Record<string, unknown>;
    properties['a'] = 'lowercase';
    properties['Z'] = 'uppercase';
    properties['status'] = 'ready';
    properties['__proto__'] = 'retained-data';
    const indexHandle = await indexes.writeShards(WarpStream.from([
      new PropertyShard({
        shardKey,
        schemaVersion: 2,
        entries: [['node:1', properties]],
      }),
    ]));

    const handles = await indexes.readShardHandles(indexHandle);
    const propertyHandle = handles[`props_${shardKey}.cbor`];
    if (propertyHandle === undefined) {
      throw new Error('expected a property shard handle');
    }
    await expect(indexes.decodeShard(propertyHandle)).resolves.toEqual({
      schemaVersion: 2,
      entries: [['node:1', [
        ['Z', 'uppercase'],
        ['__proto__', 'retained-data'],
        ['a', 'lowercase'],
        ['status', 'ready'],
      ]]],
    });

    const recovered = await indexes.scanShards(indexHandle).collect();
    const shard = recovered[0];
    expect(shard).toBeInstanceOf(PropertyShard);
    if (!(shard instanceof PropertyShard)) {
      throw new Error('expected a property shard');
    }
    const bag = shard.entries[0]?.[1];
    expect(shard.schemaVersion).toBe(2);
    expect(bag).toBeDefined();
    expect(Object.hasOwn(bag ?? {}, '__proto__')).toBe(true);
    expect(bag?.['__proto__']).toBe('retained-data');
    expect(Object.getPrototypeOf(bag)).toBeNull();
    expect(Object.isFrozen(bag)).toBe(true);
    expect(({} as Record<string, unknown>)['retained-data']).toBeUndefined();
  });

  it('rejects unsupported property shard schema versions during encoding', async () => {
    await expect(indexes.writeShards(WarpStream.from([
      new PropertyShard({
        shardKey: 'a0',
        schemaVersion: 3,
        entries: [['node:1', { status: 'future' }]],
      }),
    ]))).rejects.toMatchObject({ code: 'E_INDEX_SHARD_SCHEMA' });
  });

  it('lists shard handles without opening shard payloads', async () => {
    const indexHandle = await indexes.writeShards(WarpStream.from(shards()));
    const open = vi.spyOn(assets, 'open');
    const handles = await indexes.readShardHandles(indexHandle);

    expect(Object.keys(handles).sort()).toEqual([
      'fwd_a0.cbor',
      'labels.cbor',
      'meta_a0.cbor',
      `props_${computeShardKey('node:1')}.cbor`,
      'receipt.cbor',
      'rev_a0.cbor',
    ]);
    expect(Object.values(handles).every((handle) => handle instanceof AssetHandle)).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });

  it('resolves one shard handle without enumerating or opening siblings', async () => {
    const indexHandle = await indexes.writeShards(WarpStream.from(shards()));
    const open = vi.spyOn(assets, 'open');
    const directIndexes = indexAdapter(assets, {
      pages: cas.pages,
      bundles: {
        getMemberReference: cas.bundles.getMemberReference,
        putOrdered: cas.bundles.putOrdered,
        iterateMemberReferences: () => {
          throw new Error('readShardHandle must not enumerate bundle members');
        },
      },
    });

    await expect(directIndexes.readShardHandle(
      indexHandle,
      `props_${computeShardKey('node:1')}.cbor`,
    ))
      .resolves.toBeInstanceOf(AssetHandle);
    await expect(directIndexes.readShardHandle(indexHandle, 'missing.cbor'))
      .resolves.toBeNull();

    expect(open).not.toHaveBeenCalled();
  });

  it('stores bounded exact-read shards as pages and decodes one bundle member', async () => {
    const stage = vi.spyOn(assets, 'stage');
    const nodeId = 'node:page-backed';
    const shardKey = materializationPropertyShardKey(nodeId);
    const path = `props_${shardKey}.cbor`;
    const indexHandle = await indexes.writeShards(WarpStream.from([
      new PropertyShard({
        shardKey,
        schemaVersion: 2,
        entries: [[nodeId, { status: 'ready' }]],
      }),
    ]), {
      expectedShardCount: 1,
      memberStorage: 'page',
      maxShardCount: 1,
      maxShardBytes: 1024,
      maxContainerEntries: 16,
      maxDepth: 8,
      maxItems: 64,
    });
    const token = cas.readBundleMembers(indexHandle.toString())[0]?.[1];
    if (token === undefined) {
      throw new Error('expected one page-backed bundle member');
    }

    expect(GitCasPageHandle.from(token)).toBeInstanceOf(GitCasPageHandle);
    expect(stage).not.toHaveBeenCalled();
    await expect(indexes.decodeShardAt(indexHandle, path, {
      maxBytes: 1024,
      maxContainerEntries: 16,
      maxDepth: 8,
      maxItems: 64,
    })).resolves.toEqual({
      schemaVersion: 2,
      entries: [[nodeId, [['status', 'ready']]]],
    });
    await expect(indexes.decodeShardAt(indexHandle, 'missing.cbor', {
      maxBytes: 1024,
    })).resolves.toBeNull();
    await expect(indexes.readShardHandles(indexHandle))
      .rejects.toMatchObject({ code: 'E_INDEX_INVALID_BUNDLE_MEMBER' });
  });

  it('routes page-backed shards and their bundle through the staging scope', async () => {
    const bundle = new BundleHandle('test:staged-property-bundle');
    const stagePage = vi.fn(async () => 'test:staged-property-page');
    const stageOrderedBundle = vi.fn(async () => bundle);
    const shardKey = materializationPropertyShardKey('node:staged');

    await expect(indexes.writeShards(WarpStream.from([
      new PropertyShard({
        shardKey,
        schemaVersion: 2,
        entries: [['node:staged', { status: 'ready' }]],
      }),
    ]), {
      expectedShardCount: 1,
      memberStorage: 'page',
      maxShardCount: 1,
      maxShardBytes: 1024,
      staging: { stagePage, stageOrderedBundle },
    })).resolves.toBe(bundle);

    expect(stagePage).toHaveBeenCalledOnce();
    expect(stagePage).toHaveBeenCalledWith(expect.any(Uint8Array), { maxBytes: 1024 });
    expect(stageOrderedBundle).toHaveBeenCalledWith(
      [[`props_${shardKey}.cbor`, 'test:staged-property-page']],
      { maxMembers: 1 },
    );
  });

  it('rejects structurally over-limit shards before staging them', async () => {
    const stagePage = vi.fn(async () => 'test:must-not-stage-page');
    const stageOrderedBundle = vi.fn(async () => new BundleHandle('test:must-not-stage-bundle'));

    await expect(indexes.writeShards(WarpStream.from([
      new PropertyShard({
        shardKey: materializationPropertyShardKey('node:deep'),
        schemaVersion: 2,
        entries: [['node:deep', { value: [[[[['too-deep']]]]] }]],
      }),
    ]), {
      expectedShardCount: 1,
      memberStorage: 'page',
      maxShardCount: 1,
      maxShardBytes: 1024,
      maxContainerEntries: 16,
      maxDepth: 4,
      maxItems: 64,
      staging: { stagePage, stageOrderedBundle },
    })).rejects.toMatchObject({ code: 'E_INDEX_SHARD_MALFORMED' });

    expect(stagePage).not.toHaveBeenCalled();
    expect(stageOrderedBundle).not.toHaveBeenCalled();
  });

  it('opens and decodes exactly one selected shard handle', async () => {
    const indexHandle = await indexes.writeShards(WarpStream.from(shards()));
    const handles = await indexes.readShardHandles(indexHandle);
    const receiptHandle = handles['receipt.cbor'];
    if (receiptHandle === undefined) {
      throw new Error('expected receipt shard handle');
    }

    const bytes = await collectAsyncIterable(indexes.openShard(receiptHandle));
    expect(defaultCodec.decode(bytes)).toEqual({
      version: 1,
      nodeCount: 2,
      labelCount: 2,
      shardCount: 5,
    });
    await expect(indexes.decodeShard(receiptHandle)).resolves.toEqual(defaultCodec.decode(bytes));
  });

  it('decodes a fragmented asset member by exact bundle path', async () => {
    const path = 'props_fragmented.cbor';
    const value = { status: 'fragmented' };
    const bytes = defaultCodec.encode(value);
    const staged = await assets.stage(WarpStream.from([bytes]), {
      slug: 'fragmented-exact-index-shard',
      filename: path,
    });
    const bundle = await cas.bundles.putOrdered({
      members: [[path, staged.handle.toString()]],
    });
    const split = Math.floor(bytes.byteLength / 2);
    vi.spyOn(assets, 'open').mockImplementation(async function* () {
      yield new Uint8Array();
      yield bytes.subarray(0, split);
      yield bytes.subarray(split);
    });

    await expect(indexes.decodeShardAt(
      new BundleHandle(bundle.handle.toString()),
      path,
      {
        maxBytes: 1024,
        maxContainerEntries: 16,
        maxDepth: 8,
        maxItems: 64,
      },
    )).resolves.toEqual(value);
  });

  it('rejects a non-page, non-asset exact bundle member', async () => {
    const nested = await cas.bundles.putOrdered({ members: [] });
    const bundle = await cas.bundles.putOrdered({
      members: [['nested.cbor', nested.handle.toString()]],
    });

    await expect(indexes.decodeShardAt(
      new BundleHandle(bundle.handle.toString()),
      'nested.cbor',
    )).rejects.toMatchObject({ code: 'E_INDEX_INVALID_BUNDLE_MEMBER' });
  });

  it('rejects oversized shards on write and exact read', async () => {
    const encode = vi.spyOn(defaultCodec, 'encode');
    await expect(indexes.writeShards(WarpStream.from([
      new PropertyShard({
        shardKey: 'a0',
        entries: [['node:1', { value: 'larger than this limit' }]],
      }),
    ]), { maxShardBytes: 8 })).rejects.toMatchObject({ code: 'E_INDEX_SHARD_TOO_LARGE' });
    expect(encode).not.toHaveBeenCalled();

    const staged = await assets.stage(WarpStream.from([new Uint8Array(9)]), {
      slug: 'oversized-index-shard',
      filename: 'props_a0.cbor',
    });
    await expect(indexes.decodeShard(staged.handle, {
      maxBytes: 8,
      maxContainerEntries: 10,
      maxDepth: 10,
      maxItems: 100,
    })).rejects.toMatchObject({ code: 'E_INDEX_SHARD_TOO_LARGE' });
  });

  it('bounds the number of non-empty chunks collected for one exact read', async () => {
    const staged = await assets.stage(WarpStream.from([defaultCodec.encode(['value'])]), {
      slug: 'fragmented-index-shard',
      filename: 'props_00.cbor',
    });
    vi.spyOn(assets, 'open').mockImplementation(async function* () {
      for (let index = 0; index < 4097; index += 1) {
        yield new Uint8Array([0]);
      }
    });

    await expect(indexes.decodeShard(staged.handle, { maxBytes: 5000 }))
      .rejects.toMatchObject({ code: 'E_INDEX_SHARD_CHUNK_LIMIT' });
  });

  it('rejects an over-limit declared shard count before staging any assets', async () => {
    const stage = vi.spyOn(assets, 'stage');

    await expect(indexes.writeShards(WarpStream.of(), {
      expectedShardCount: 100_001,
      maxShardCount: 100_000,
    })).rejects.toMatchObject({ code: 'E_INDEX_SHARD_COUNT_LIMIT' });

    expect(stage).not.toHaveBeenCalled();
  });

  it('rejects a shard stream that violates its declared count', async () => {
    await expect(indexes.writeShards(WarpStream.of(), {
      expectedShardCount: 1,
      maxShardCount: 1,
    })).rejects.toMatchObject({ code: 'E_INDEX_SHARD_COUNT_LIMIT' });
  });

  it('requires an explicit byte limit for page-backed shards', async () => {
    await expect(indexes.writeShards(WarpStream.of(), {
      memberStorage: 'page',
    })).rejects.toMatchObject({ code: 'E_INDEX_INVALID_LIMIT' });
  });

  it('rejects invalid write storage policies before consuming shards', async () => {
    await expect(indexes.writeShards(WarpStream.of(), {
      // @ts-expect-error Runtime guard for JavaScript callers.
      memberStorage: 'blob',
    })).rejects.toMatchObject({ code: 'E_INDEX_INVALID_STORAGE' });
    await expect(indexes.writeShards(WarpStream.of(), {
      // @ts-expect-error Runtime guard for JavaScript callers.
      staging: { stagePage: null, stageOrderedBundle: null },
    })).rejects.toMatchObject({ code: 'E_INDEX_INVALID_STORAGE' });
  });

  it('enforces the encoded byte ceiling for non-property shards', async () => {
    await expect(indexes.writeShards(WarpStream.from([
      new ReceiptShard({ version: 1, nodeCount: 1, labelCount: 1, shardCount: 1 }),
    ]), { maxShardBytes: 1 })).rejects.toMatchObject({
      code: 'E_INDEX_SHARD_TOO_LARGE',
    });
  });

  it('rejects dangerous CBOR containers before general decoding', async () => {
    const declaredArray = await assets.stage(WarpStream.from([
      new Uint8Array([0x99, 0x03, 0xe9]),
    ]), {
      slug: 'declared-array-index-shard',
      filename: 'props_a0.cbor',
    });
    await expect(indexes.decodeShard(declaredArray.handle, {
      maxBytes: 64,
      maxContainerEntries: 100,
      maxDepth: 10,
      maxItems: 1_000,
    })).rejects.toMatchObject({ code: 'E_INDEX_SHARD_MALFORMED' });

    const nested = await assets.stage(WarpStream.from([
      defaultCodec.encode([[[['value']]]]),
    ]), {
      slug: 'nested-index-shard',
      filename: 'props_a0.cbor',
    });
    await expect(indexes.decodeShard(nested.handle, {
      maxBytes: 64,
      maxContainerEntries: 100,
      maxDepth: 2,
      maxItems: 1_000,
    })).rejects.toMatchObject({ code: 'E_INDEX_SHARD_MALFORMED' });
  });

  it.each([
    ['unsigned integer', new Uint8Array([0x00])],
    ['negative integer', new Uint8Array([0x20])],
    ['byte string', new Uint8Array([0x41, 0x00])],
    ['text string', new Uint8Array([0x61, 0x61])],
    ['array', new Uint8Array([0x81, 0x00])],
    ['map', new Uint8Array([0xa1, 0x61, 0x61, 0x00])],
    ['tagged value', new Uint8Array([0xc0, 0x00])],
    ['simple value', new Uint8Array([0xf4])],
    ['wide simple value', new Uint8Array([0xf9, 0x00, 0x00])],
  ])('preflights a bounded %s CBOR value', (_name, bytes) => {
    expect(() => validateBoundedCbor(bytes, CBOR_STRUCTURE_LIMITS)).not.toThrow();
  });

  it.each([
    [
      'trailing value',
      new Uint8Array([0x00, 0x00]),
      CBOR_STRUCTURE_LIMITS,
    ],
    [
      'exhausted item budget',
      new Uint8Array([0x81, 0x00]),
      { ...CBOR_STRUCTURE_LIMITS, maxItems: 1 },
    ],
    [
      'reserved simple value',
      new Uint8Array([0xfc]),
      CBOR_STRUCTURE_LIMITS,
    ],
    [
      'indefinite value',
      new Uint8Array([0x5f, 0xff]),
      CBOR_STRUCTURE_LIMITS,
    ],
    [
      'reserved additional information',
      new Uint8Array([0x1c]),
      CBOR_STRUCTURE_LIMITS,
    ],
    [
      'duplicate map key',
      new Uint8Array([0xa2, 0x61, 0x61, 0x01, 0x61, 0x61, 0x02]),
      CBOR_STRUCTURE_LIMITS,
    ],
    [
      'non-preferred duplicate map key',
      new Uint8Array([0xa2, 0x61, 0x61, 0x01, 0x78, 0x01, 0x61, 0x02]),
      CBOR_STRUCTURE_LIMITS,
    ],
    [
      'invalid UTF-8 map key',
      new Uint8Array([0xa1, 0x61, 0xff, 0x01]),
      CBOR_STRUCTURE_LIMITS,
    ],
    [
      'non-text map key',
      new Uint8Array([0xa1, 0x00, 0x00]),
      CBOR_STRUCTURE_LIMITS,
    ],
    [
      'unsafe declared length',
      new Uint8Array([0x5b, 0x00, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      CBOR_STRUCTURE_LIMITS,
    ],
    [
      'missing initial byte',
      new Uint8Array(),
      CBOR_STRUCTURE_LIMITS,
    ],
    [
      'truncated byte string',
      new Uint8Array([0x42, 0x00]),
      CBOR_STRUCTURE_LIMITS,
    ],
  ])('rejects a malformed CBOR %s before decoding', (_name, bytes, limits) => {
    expect(() => validateBoundedCbor(bytes, limits)).toThrowError(
      expect.objectContaining({ code: 'E_INDEX_SHARD_MALFORMED' }),
    );
  });

  it('rejects partial and invalid exact-read limits', async () => {
    const staged = await assets.stage(WarpStream.from([defaultCodec.encode(['bounded'])]), {
      slug: 'invalid-limit-index-shard',
      filename: 'props_a0.cbor',
    });

    for (const options of [
      { maxContainerEntries: 10 },
      { maxBytes: 0 },
      { maxContainerEntries: 0, maxDepth: 10, maxItems: 100 },
      { maxContainerEntries: 10, maxDepth: -1, maxItems: 100 },
      { maxContainerEntries: 10, maxDepth: 10, maxItems: 0 },
    ]) {
      await expect(indexes.decodeShard(staged.handle, options))
        .rejects.toMatchObject({ code: 'E_INDEX_INVALID_LIMIT' });
    }
  });

  it('rejects partial and invalid write-side structure limits', async () => {
    for (const options of [
      { maxContainerEntries: 10 },
      { maxContainerEntries: 0, maxDepth: 10, maxItems: 100 },
      { maxContainerEntries: 10, maxDepth: -1, maxItems: 100 },
      { maxContainerEntries: 10, maxDepth: 10, maxItems: 0 },
    ]) {
      await expect(indexes.writeShards(WarpStream.of(), options))
        .rejects.toMatchObject({ code: 'E_INDEX_INVALID_LIMIT' });
    }
  });

  it('ignores unknown physical paths while scanning compatibility indexes', async () => {
    const staged = await assets.stage(WarpStream.from([defaultCodec.encode({ ignored: true })]), {
      slug: 'unknown-index-member',
      filename: 'unknown.cbor',
    });
    const bundle = await cas.bundles.putOrdered({
      members: [['unknown.cbor', staged.handle.toString()]],
    });

    await expect(indexes.scanShards(new BundleHandle(bundle.handle.toString())).collect())
      .resolves.toEqual([]);
  });

  it('rejects property entries routed under the wrong compatibility shard path', async () => {
    const nodeId = 'node:misrouted';
    const expected = computeShardKey(nodeId);
    const wrong = expected === '00' ? '01' : '00';
    const staged = await assets.stage(WarpStream.from([
      defaultCodec.encode([[nodeId, { status: 'misrouted' }]]),
    ]), {
      slug: 'misrouted-property-shard',
      filename: `props_${wrong}.cbor`,
    });
    const bundle = await cas.bundles.putOrdered({
      members: [[`props_${wrong}.cbor`, staged.handle.toString()]],
    });

    await expect(indexes.scanShards(new BundleHandle(bundle.handle.toString())).collect())
      .rejects.toMatchObject({ code: 'E_INDEX_SHARD_MALFORMED' });
  });

  it('rejects schema-v2 property entries routed under the legacy shard profile', async () => {
    const nodeId = 'node:retained-profile';
    const indexHandle = await indexes.writeShards(WarpStream.from([
      new PropertyShard({
        shardKey: computeShardKey(nodeId),
        schemaVersion: 2,
        entries: [[nodeId, { status: 'misrouted' }]],
      }),
    ]));

    await expect(indexes.scanShards(indexHandle).collect())
      .rejects.toMatchObject({ code: 'E_INDEX_SHARD_MALFORMED' });
  });

  it('rejects duplicate member paths while listing or scanning an index bundle', async () => {
    const indexHandle = await indexes.writeShards(WarpStream.from(shards()));
    const duplicateCas: GitCasIndexFacade = {
      pages: cas.pages,
      bundles: {
        getMemberReference: cas.bundles.getMemberReference,
        putOrdered: cas.bundles.putOrdered,
        iterateMemberReferences: async function* (request) {
          let duplicated = false;
          for await (const member of cas.bundles.iterateMemberReferences(request)) {
            yield member;
            if (!duplicated) {
              yield member;
              duplicated = true;
            }
          }
        },
      },
    };
    const duplicateIndexes = indexAdapter(assets, duplicateCas);

    await expect(duplicateIndexes.readShardHandles(indexHandle))
      .rejects.toMatchObject({ code: 'E_INDEX_DUPLICATE_BUNDLE_MEMBER' });
    await expect(duplicateIndexes.scanShards(indexHandle).collect())
      .rejects.toMatchObject({ code: 'E_INDEX_DUPLICATE_BUNDLE_MEMBER' });
  });

  it('rejects non-asset members while listing or scanning an index bundle', async () => {
    const indexHandle = await indexes.writeShards(WarpStream.from(shards()));
    const nonAssetCas: GitCasIndexFacade = {
      pages: cas.pages,
      bundles: {
        getMemberReference: cas.bundles.getMemberReference,
        putOrdered: cas.bundles.putOrdered,
        iterateMemberReferences: async function* (request) {
          for await (const member of cas.bundles.iterateMemberReferences(request)) {
            yield Object.freeze({
              ...member,
              path: 'unknown.cbor',
              handle: GitCasBundleHandle.parse(indexHandle.toString()),
            });
          }
        },
      },
    };
    const nonAssetIndexes = indexAdapter(assets, nonAssetCas);

    await expect(nonAssetIndexes.readShardHandles(indexHandle))
      .rejects.toMatchObject({ code: 'E_INDEX_INVALID_BUNDLE_MEMBER' });
    await expect(nonAssetIndexes.scanShards(indexHandle).collect())
      .rejects.toMatchObject({ code: 'E_INDEX_INVALID_BUNDLE_MEMBER' });
  });
});

function indexAdapter(
  assetStorage: GitCasAssetStorageAdapter,
  cas: GitCasIndexFacade,
): CborIndexStoreAdapter {
  return new CborIndexStoreAdapter({ codec: defaultCodec, assetStorage, cas });
}
