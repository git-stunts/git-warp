import { describe, it, expect, beforeEach } from 'vitest';
import { CborIndexStoreAdapter } from '../../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import { decodeCasPayloadPointer } from '../../../src/infrastructure/adapters/CasPayloadPointer.ts';
import IndexStorePort from '../../../src/ports/IndexStorePort.ts';
import BlobStoragePort from '../../../src/ports/BlobStoragePort.ts';
import MockBlobPort from '../../helpers/MockBlobPort.ts';
import MockTreePort from '../../helpers/MockTreePort.ts';
import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import WarpStream from '../../../src/domain/stream/WarpStream.ts';
import { MetaShard } from '../../../src/domain/artifacts/MetaShard.ts';
import { EdgeShard } from '../../../src/domain/artifacts/EdgeShard.ts';
import { LabelShard } from '../../../src/domain/artifacts/LabelShard.ts';
import { PropertyShard } from '../../../src/domain/artifacts/PropertyShard.ts';
import { ReceiptShard } from '../../../src/domain/artifacts/ReceiptShard.ts';

class MemoryBlobStorage extends BlobStoragePort {
  private readonly _store: Map<string, Uint8Array>;
  private _counter: number;

  constructor() {
    super();
    this._store = new Map();
    this._counter = 0;
  }

  override async store(content: Uint8Array | string): Promise<string> {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    const oid = `storage_${String(this._counter++).padStart(4, '0')}`;
    this._store.set(oid, bytes);
    return oid;
  }

  override async retrieve(oid: string): Promise<Uint8Array> {
    const bytes = this._store.get(oid);
    if (bytes === undefined) {
      throw new Error(`Storage OID not found: ${oid}`);
    }
    return bytes;
  }

  override async storeStream(source: AsyncIterable<Uint8Array>): Promise<string> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of source) {
      chunks.push(chunk);
    }
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return await this.store(merged);
  }

  override retrieveStream(oid: string): AsyncIterable<Uint8Array> {
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        yield await self.retrieve(oid);
      },
    };
  }
}

describe('CborIndexStoreAdapter', () => {
    let blobPort;
    let treePort;
    let adapter;

  beforeEach(() => {
    blobPort = new MockBlobPort();
    treePort = new MockTreePort();
    adapter = new CborIndexStoreAdapter({
      codec: defaultCodec,
      blobPort,
      treePort,
    });
  });

  // ── Construction ────────────────────────────────────────────────

  describe('constructor', () => {
    it('extends IndexStorePort', () => {
      expect(adapter).toBeInstanceOf(IndexStorePort);
    });

    it('rejects null codec', () => {
      expect(() => new CborIndexStoreAdapter({
        codec: (null as any),
        blobPort,
        treePort,
      })).toThrow('requires a codec');
    });

    it('rejects null blobPort', () => {
      expect(() => new CborIndexStoreAdapter({
        codec: defaultCodec,
        blobPort: (null as any),
        treePort,
      })).toThrow('requires a blobPort');
    });

    it('rejects null treePort', () => {
      expect(() => new CborIndexStoreAdapter({
        codec: defaultCodec,
        blobPort,
        treePort: (null as any),
      })).toThrow('requires a treePort');
    });
  });

  // ── Shard Fixtures ──────────────────────────────────────────────

  /**
   * Creates a representative set of IndexShard instances for testing.
   * @returns {import('../../../src/domain/artifacts/IndexShard.ts').IndexShard[]}
   */
  function createTestShards() {
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
      new LabelShard({
        labels: [['manages', 0], ['owns', 1]],
      }),
      new PropertyShard({
        shardKey: 'a0',
        entries: [['node:1', { name: 'Alice' }]],
      }),
      new ReceiptShard({
        version: 1,
        nodeCount: 2,
        labelCount: 2,
        shardCount: 5,
      }),
    ];
  }

  // ── writeShards ─────────────────────────────────────────────────

  describe('writeShards', () => {
    it('persists shards and returns a tree OID', async () => {
      const shards = createTestShards();
      const stream = WarpStream.from(shards);
      const treeOid = await adapter.writeShards(stream);

      expect(typeof treeOid).toBe('string');
      expect(treeOid).toMatch(/^tree_/);

      // Verify blobs were written (one per shard)
      expect(blobPort.writeBlob).toHaveBeenCalledTimes(shards.length);

      // Verify tree was written
      expect(treePort.writeTree).toHaveBeenCalledTimes(1);
    });

    it('creates tree entries with correct paths', async () => {
      const shards = createTestShards();
      await adapter.writeShards(WarpStream.from(shards));

      const mock = (treePort.writeTree as any);
      const firstCall = (mock.mock.calls[0] as unknown[]);
      const treeEntries = (firstCall[0] as string[]);
      const paths = treeEntries.map((e) => e.split('\t')[1]).sort();

      expect(paths).toEqual([
        'fwd_a0.cbor',
        'labels.cbor',
        'meta_a0.cbor',
        'props_a0.cbor',
        'receipt.cbor',
        'rev_a0.cbor',
      ]);
    });

    it('stores shard payloads behind CAS pointer blobs when blobStorage is configured', async () => {
      const blobStorage = new MemoryBlobStorage();
      const casBackedAdapter = new CborIndexStoreAdapter({
        codec: defaultCodec,
        blobPort,
        treePort,
        blobStorage,
      });

      const treeOid = await casBackedAdapter.writeShards(WarpStream.from(createTestShards()));
      const oidMap = await treePort.readTreeOids(treeOid);

      expect(Object.keys(oidMap)).toHaveLength(6);

      for (const oid of Object.values(oidMap)) {
        const pointerBytes = await blobPort.readBlob(oid);
        expect(decodeCasPayloadPointer(pointerBytes)).not.toBeNull();
      }
    });
  });

  // ── writeShards → scanShards round-trip ─────────────────────────

  describe('writeShards → scanShards round-trip', () => {
    it('reconstructs IndexShard instances from persisted tree', async () => {
      const original = createTestShards();
      const treeOid = await adapter.writeShards(WarpStream.from(original));

      const recovered = await adapter.scanShards(treeOid).collect();

      expect(recovered).toHaveLength(original.length);

      // Check each shard subclass was correctly classified
      const meta = recovered.find((s) => s instanceof MetaShard);
      const fwd = recovered.find((s) => s instanceof EdgeShard && s.direction === 'fwd');
      const rev = recovered.find((s) => s instanceof EdgeShard && s.direction === 'rev');
      const labels = recovered.find((s) => s instanceof LabelShard);
      const props = recovered.find((s) => s instanceof PropertyShard);
      const receipt = recovered.find((s) => s instanceof ReceiptShard);

      expect(meta).toBeDefined();
      expect(fwd).toBeDefined();
      expect(rev).toBeDefined();
      expect(labels).toBeDefined();
      expect(props).toBeDefined();
      expect(receipt).toBeDefined();
    });

    it('preserves MetaShard payload', async () => {
      const original = new MetaShard({
        shardKey: 'b3',
        nodeToGlobal: [['x', 10], ['y', 20]],
        nextLocalId: 21,
        alive: new Uint8Array([0xab, 0xcd]),
      });
      const treeOid = await adapter.writeShards(WarpStream.from([original]));
      const [recovered] = await adapter.scanShards(treeOid).collect();

      expect(recovered).toBeInstanceOf(MetaShard);
      const meta = (recovered);
      expect(meta.shardKey).toBe('b3');
      expect(meta.nodeToGlobal).toEqual([['x', 10], ['y', 20]]);
      expect(meta.nextLocalId).toBe(21);
      expect(meta.alive).toEqual(new Uint8Array([0xab, 0xcd]));
    });

    it('preserves EdgeShard payload', async () => {
      const original = new EdgeShard({
        shardKey: 'ff',
        direction: 'fwd',
        buckets: { all: { '5': new Uint8Array([0x01, 0x02]) } },
      });
      const treeOid = await adapter.writeShards(WarpStream.from([original]));
      const [recovered] = await adapter.scanShards(treeOid).collect();

      expect(recovered).toBeInstanceOf(EdgeShard);
      const edge = (recovered);
      expect(edge.shardKey).toBe('ff');
      expect(edge.direction).toBe('fwd');
      expect(edge.buckets).toEqual({ all: { '5': new Uint8Array([0x01, 0x02]) } });
    });

    it('preserves LabelShard payload', async () => {
      const original = new LabelShard({
        labels: [['edge_type_a', 0], ['edge_type_b', 1]],
      });
      const treeOid = await adapter.writeShards(WarpStream.from([original]));
      const [recovered] = await adapter.scanShards(treeOid).collect();

      expect(recovered).toBeInstanceOf(LabelShard);
      const label = (recovered);
      expect(label.labels).toEqual([['edge_type_a', 0], ['edge_type_b', 1]]);
    });

    it('preserves PropertyShard payload', async () => {
      const original = new PropertyShard({
        shardKey: 'c2',
        entries: [['node:x', { k: 'v', n: 42 }]],
      });
      const treeOid = await adapter.writeShards(WarpStream.from([original]));
      const [recovered] = await adapter.scanShards(treeOid).collect();

      expect(recovered).toBeInstanceOf(PropertyShard);
      const prop = (recovered);
      expect(prop.shardKey).toBe('c2');
      expect(prop.entries).toEqual([['node:x', { k: 'v', n: 42 }]]);
    });

    it('preserves ReceiptShard payload', async () => {
      const original = new ReceiptShard({
        version: 2,
        nodeCount: 1000,
        labelCount: 50,
        shardCount: 256,
      });
      const treeOid = await adapter.writeShards(WarpStream.from([original]));
      const [recovered] = await adapter.scanShards(treeOid).collect();

      expect(recovered).toBeInstanceOf(ReceiptShard);
      const receipt = (recovered);
      expect(receipt.version).toBe(2);
      expect(receipt.nodeCount).toBe(1000);
      expect(receipt.labelCount).toBe(50);
      expect(receipt.shardCount).toBe(256);
    });

    it('round-trips CAS-backed pointer blobs through blobStorage', async () => {
      const blobStorage = new MemoryBlobStorage();
      const casBackedAdapter = new CborIndexStoreAdapter({
        codec: defaultCodec,
        blobPort,
        treePort,
        blobStorage,
      });

      const original = createTestShards();
      const treeOid = await casBackedAdapter.writeShards(WarpStream.from(original));
      const recovered = await casBackedAdapter.scanShards(treeOid).collect();

      expect(recovered).toHaveLength(original.length);
      expect(recovered.find((shard) => shard instanceof MetaShard)).toBeDefined();
      expect(recovered.find((shard) => shard instanceof ReceiptShard)).toBeDefined();
    });
  });

  // ── readShardOids ───────────────────────────────────────────────

  describe('readShardOids', () => {
    it('returns path→OID map without reading blob contents', async () => {
      const treeOid = await adapter.writeShards(WarpStream.from(createTestShards()));
      const oids = await adapter.readShardOids(treeOid);

      expect(Object.keys(oids).sort()).toEqual([
        'fwd_a0.cbor',
        'labels.cbor',
        'meta_a0.cbor',
        'props_a0.cbor',
        'receipt.cbor',
        'rev_a0.cbor',
      ]);

      // Every value is a blob OID
      for (const oid of Object.values(oids)) {
        expect(typeof oid).toBe('string');
        expect(oid).toMatch(/^blob_/);
      }
    });
  });

  // ── decodeShard ─────────────────────────────────────────────────

  describe('decodeShard', () => {
    it('reads and decodes a blob by OID', async () => {
      const data = { version: 1, nodeCount: 5, labelCount: 2, shardCount: 10 };
      const bytes = defaultCodec.encode(data);
      const oid = await blobPort.writeBlob(bytes);

      const decoded = await adapter.decodeShard(oid);
      expect(decoded).toEqual(data);
    });
  });

  // ── scanShards classification ───────────────────────────────────

  describe('scanShards classification', () => {
    it('skips unknown path patterns without throwing', async () => {
      // Manually insert a tree with an unrecognized path (e.g., frontier.cbor)
      const bytes = defaultCodec.encode({ foo: 'bar' });
      const blobOid = await blobPort.writeBlob(bytes);
      treePort.store.set('tree_unknown', { 'garbage_file.cbor': blobOid });

      const shards = await adapter.scanShards('tree_unknown').collect();
      expect(shards).toEqual([]);
    });
  });
});
