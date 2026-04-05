import { describe, it, expect, beforeEach } from 'vitest';
import { CborIndexStoreAdapter } from '../../../src/infrastructure/adapters/CborIndexStoreAdapter.js';
import IndexStorePort from '../../../src/ports/IndexStorePort.js';
import MockBlobPort from '../../helpers/MockBlobPort.js';
import MockTreePort from '../../helpers/MockTreePort.js';
import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.js';
import WarpStream from '../../../src/domain/stream/WarpStream.js';
import {
  MetaShard,
  EdgeShard,
  LabelShard,
  PropertyShard,
  ReceiptShard,
} from '../../../src/domain/artifacts/IndexShard.js';

describe('CborIndexStoreAdapter', () => {
  /** @type {MockBlobPort} */
  let blobPort;
  /** @type {MockTreePort} */
  let treePort;
  /** @type {CborIndexStoreAdapter} */
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
        codec: /** @type {*} */ (null),
        blobPort,
        treePort,
      })).toThrow('requires a codec');
    });

    it('rejects null blobPort', () => {
      expect(() => new CborIndexStoreAdapter({
        codec: defaultCodec,
        blobPort: /** @type {*} */ (null),
        treePort,
      })).toThrow('requires a blobPort');
    });

    it('rejects null treePort', () => {
      expect(() => new CborIndexStoreAdapter({
        codec: defaultCodec,
        blobPort,
        treePort: /** @type {*} */ (null),
      })).toThrow('requires a treePort');
    });
  });

  // ── Shard Fixtures ──────────────────────────────────────────────

  /**
   * Creates a representative set of IndexShard instances for testing.
   * @returns {import('../../../src/domain/artifacts/IndexShard.js').IndexShard[]}
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

      const mock = /** @type {import('vitest').Mock} */ (treePort.writeTree);
      const firstCall = /** @type {unknown[]} */ (mock.mock.calls[0]);
      const treeEntries = /** @type {string[]} */ (firstCall[0]);
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
      const meta = /** @type {MetaShard} */ (recovered);
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
      const edge = /** @type {EdgeShard} */ (recovered);
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
      const label = /** @type {LabelShard} */ (recovered);
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
      const prop = /** @type {PropertyShard} */ (recovered);
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
      const receipt = /** @type {ReceiptShard} */ (recovered);
      expect(receipt.version).toBe(2);
      expect(receipt.nodeCount).toBe(1000);
      expect(receipt.labelCount).toBe(50);
      expect(receipt.shardCount).toBe(256);
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
    it('throws on unknown path pattern', async () => {
      // Manually insert a tree with an unrecognized path
      const bytes = defaultCodec.encode({ foo: 'bar' });
      const blobOid = await blobPort.writeBlob(bytes);
      treePort.store.set('tree_unknown', { 'garbage_file.cbor': blobOid });

      await expect(adapter.scanShards('tree_unknown').collect())
        .rejects.toThrow('Unknown index shard path');
    });
  });
});
