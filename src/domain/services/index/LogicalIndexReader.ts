/**
 * Reads a serialized logical bitmap index from a tree (in-memory buffers)
 * or lazily from OID→blob storage, and produces a LogicalIndex interface.
 *
 * Extracted from test/helpers/fixtureDsl.js so that production code can
 * hydrate indexes stored inside checkpoints (Phase 3).
 *
 * @module domain/services/index/LogicalIndexReader
 */

import toBytes from '../../utils/toBytes.ts';
import { getRoaringBitmap32, type RoaringBitmapSubset } from '../../utils/roaring.ts';
import { MetaShard } from '../../artifacts/MetaShard.ts';
import { EdgeShard } from '../../artifacts/EdgeShard.ts';
import { LabelShard } from '../../artifacts/LabelShard.ts';
import IndexError from '../../errors/IndexError.ts';
import { requireCodec } from '../codec/CodecRequirement.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type IndexStorePort from '../../../ports/IndexStorePort.ts';
import type { IndexShard } from '../../artifacts/IndexShard.ts';
import {
  buildLogicalIndex,
  classifyDecoded,
  classifyShards,
  type ClassifiedDecoded,
  type DecodedItem,
  type LogicalIndex,
  type ShardItem,
} from './logicalIndexHelpers.ts';

export type { LogicalIndex } from './logicalIndexHelpers.ts';

/** typeof RoaringBitmap32 constructor (the class itself, not an instance). */
type RoaringCtor = ReturnType<typeof getRoaringBitmap32>;

export default class LogicalIndexReader {
  private _codec: CodecPort | null;
  private _indexStore: IndexStorePort | null;

  private _nodeToGlobal: Map<string, number>;
  private _globalToNode: Map<number, string>;
  private _aliveBitmaps: Map<string, RoaringBitmapSubset>;
  private _labelRegistry: Map<string, number>;
  private _idToLabel: Map<number, string>;
  private _edgeFwd: Map<string, RoaringBitmapSubset>;
  private _edgeRev: Map<string, RoaringBitmapSubset>;
  private _edgeByOwnerFwd: Map<number, Array<{ labelId: number; bitmap: RoaringBitmapSubset }>>;
  private _edgeByOwnerRev: Map<number, Array<{ labelId: number; bitmap: RoaringBitmapSubset }>>;

  /**
   * Constructs a LogicalIndexReader with an optional CBOR codec override
   * and/or an IndexStorePort for codec-free reads.
   */
  constructor(options?: { codec?: CodecPort; indexStore?: IndexStorePort }) {
    const { codec, indexStore } = options ?? {};
    this._codec = codec ?? null;
    this._indexStore = indexStore ?? null;

    this._nodeToGlobal = new Map();
    this._globalToNode = new Map();
    this._aliveBitmaps = new Map();
    this._labelRegistry = new Map();
    this._idToLabel = new Map();
    this._edgeFwd = new Map();
    this._edgeRev = new Map();
    this._edgeByOwnerFwd = new Map();
    this._edgeByOwnerRev = new Map();
  }

  /**
   * Eagerly decodes all shards from an in-memory tree (Record<path, Uint8Array>).
   */
  loadFromTree(tree: Record<string, Uint8Array>): this {
    this._resetState();
    const items: ShardItem[] = Object.entries(tree).map(([path, buf]) => ({ path, buf }));
    this._processShards(items);
    return this;
  }

  /**
   * Loads all shards from OID→blob storage (async).
   */
  async loadFromOids(
    shardOids: Record<string, string>,
    storage: { readBlob(oid: string): Promise<Uint8Array> },
  ): Promise<this> {
    this._resetState();
    const entries = Object.entries(shardOids);
    if (this._indexStore) {
      const indexStore = this._indexStore;
      const decoded: DecodedItem[] = await Promise.all(
        entries.map(async ([path, oid]) => ({ path, data: await indexStore.decodeShard(oid) })),
      );
      this._processDecoded(decoded);
    } else {
      const items: ShardItem[] = await Promise.all(
        entries.map(async ([path, oid]) => ({ path, buf: await storage.readBlob(oid) })),
      );
      this._processShards(items);
    }
    return this;
  }

  /**
   * Populates the reader directly from IndexShard domain objects.
   *
   * This is the codec-free alternative to loadFromTree() and loadFromOids().
   * No CBOR decoding is needed — the shards already carry decoded data.
   */
  loadFromShards(shards: Iterable<IndexShard>): this {
    this._resetState();
    const Ctor = getRoaringBitmap32();
    for (const shard of shards) {
      if (shard instanceof MetaShard) {
        this._loadMetaShard(shard, Ctor);
      } else if (shard instanceof LabelShard) {
        this._loadLabelShard(shard);
      } else if (shard instanceof EdgeShard) {
        this._loadEdgeShard(shard, Ctor);
      }
    }
    return this;
  }

  /**
   * Loads all shards from an IndexStorePort via scanShards (codec-free).
   *
   * The adapter reads, decodes, and classifies blobs into IndexShard
   * domain objects. The reader consumes them without touching any codec.
   */
  async loadFromStore(treeOid: string): Promise<this> {
    if (!this._indexStore) {
      throw new IndexError(
        'LogicalIndexReader: loadFromStore() requires an indexStore',
        { code: 'E_INDEX_NO_STORE' },
      );
    }
    const shards = await this._indexStore.scanShards(treeOid).collect();
    this.loadFromShards(shards);
    return this;
  }

  /**
   * Returns a LogicalIndex interface object backed by the decoded shard data.
   */
  toLogicalIndex(): LogicalIndex {
    return buildLogicalIndex({
      n2g: this._nodeToGlobal,
      g2n: this._globalToNode,
      alive: this._aliveBitmaps,
      lr: this._labelRegistry,
      i2l: this._idToLabel,
      fwd: this._edgeFwd,
      rev: this._edgeRev,
      byOwnerFwd: this._edgeByOwnerFwd,
      byOwnerRev: this._edgeByOwnerRev,
    });
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /** Processes classified shards in deterministic order (codec path). */
  private _processShards(items: ShardItem[]): void {
    const { meta, labels, edges } = classifyShards(items);
    const codec = requireCodec(this._codec, 'LogicalIndexReader');
    const decodedMeta: DecodedItem[] = meta.map(({ path, buf }) => ({ path, data: codec.decode(buf) }));
    const decodedLabels = labels ? codec.decode(labels) : null;
    const decodedEdges: DecodedItem[] = edges.map(({ path, buf }) => ({ path, data: codec.decode(buf) }));
    this._loadClassified({ meta: decodedMeta, labels: decodedLabels, edges: decodedEdges });
  }

  /**
   * Loads classified decoded data into the reader's maps.
   *
   * Shared by both the codec path (_processShards) and the
   * port path (_processDecoded). No codec interaction here.
   */
  private _loadClassified({ meta, labels, edges }: ClassifiedDecoded): void {
    const Ctor = getRoaringBitmap32();
    for (const { path, data } of meta) {
      this._loadDecodedMeta(path, data, Ctor);
    }
    if (labels !== null) {
      this._loadDecodedLabels(labels);
    }
    for (const { path, data } of edges) {
      this._loadDecodedEdges(path.startsWith('fwd_') ? 'fwd' : 'rev', data, Ctor);
    }
  }

  /** Processes pre-decoded shards (port path — no codec needed). */
  private _processDecoded(items: DecodedItem[]): void {
    const classified = classifyDecoded(items);
    this._loadClassified(classified);
  }

  /** Populates node-to-global and alive bitmap maps from decoded meta data. */
  private _loadDecodedMeta(path: string, raw: unknown, Ctor: RoaringCtor): void { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    const meta = raw as {
      nodeToGlobal: Array<[string, number]> | Record<string, number>;
      alive: Uint8Array | ArrayLike<number>;
    };
    const entries: Array<[string, unknown]> = Array.isArray(meta.nodeToGlobal) // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
      ? meta.nodeToGlobal
      : Object.entries(meta.nodeToGlobal);
    for (const [nodeId, globalId] of entries) {
      this._nodeToGlobal.set(nodeId, globalId as number);
      this._globalToNode.set(globalId as number, nodeId);
    }
    this._loadAliveBitmap(path.slice(5, 7), meta.alive, Ctor);
  }

  /** Loads an alive bitmap from decoded meta data if present and non-empty. */
  private _loadAliveBitmap(shardKey: string, aliveData: Uint8Array | ArrayLike<number>, Ctor: RoaringCtor): void {
    if (aliveData !== null && aliveData !== undefined && aliveData.length > 0) {
      this._aliveBitmaps.set(shardKey, Ctor.deserialize(toBytes(aliveData), true));
    }
  }

  /** Populates label maps from decoded label data. */
  private _loadDecodedLabels(raw: unknown): void { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    const decoded = raw as Record<string, number> | Array<[string, number]>;
    const entries: Array<[string, number]> = Array.isArray(decoded) ? decoded : Object.entries(decoded);
    for (const [label, id] of entries) {
      this._labelRegistry.set(label, id);
      this._idToLabel.set(id, label);
    }
  }

  /** Clears all decoded state so the reader can be reused safely. */
  private _resetState(): void {
    this._nodeToGlobal.clear();
    this._globalToNode.clear();
    this._aliveBitmaps.clear();
    this._labelRegistry.clear();
    this._idToLabel.clear();
    this._edgeFwd.clear();
    this._edgeRev.clear();
    this._edgeByOwnerFwd.clear();
    this._edgeByOwnerRev.clear();
  }

  /** Populates edge stores from decoded edge shard data. */
  private _loadDecodedEdges(dir: 'fwd' | 'rev', raw: unknown, Ctor: RoaringCtor): void { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    const store = dir === 'fwd' ? this._edgeFwd : this._edgeRev;
    const byOwner = dir === 'fwd' ? this._edgeByOwnerFwd : this._edgeByOwnerRev;
    const decoded = raw as Record<string, Record<string, Uint8Array | ArrayLike<number>>>;
    for (const [bucket, entries] of Object.entries(decoded)) {
      for (const [gidStr, bitmapBytes] of Object.entries(entries)) {
        const bitmap = Ctor.deserialize(toBytes(bitmapBytes), true);
        store.set(`${dir}:${bucket}:${gidStr}`, bitmap);
        this._indexByOwner(byOwner, { bucket, gidStr, bitmap });
      }
    }
  }

  /**
   * Adds a bitmap entry to the per-owner secondary index (non-'all' buckets only).
   */
  private _indexByOwner(
    byOwner: Map<number, Array<{ labelId: number; bitmap: RoaringBitmapSubset }>>,
    entry: { bucket: string; gidStr: string; bitmap: RoaringBitmapSubset },
  ): void {
    if (entry.bucket === 'all') {
      return;
    }
    const gid = parseInt(entry.gidStr, 10);
    let list = byOwner.get(gid);
    if (!list) {
      list = [];
      byOwner.set(gid, list);
    }
    list.push({ labelId: parseInt(entry.bucket, 10), bitmap: entry.bitmap });
  }

  // ── loadFromShards helpers (codec-free) ───────────────────────────────────

  /** Loads a MetaShard's data into the reader's maps. */
  private _loadMetaShard(shard: MetaShard, Ctor: RoaringCtor): void {
    for (const [nodeId, globalId] of shard.nodeToGlobal) {
      this._nodeToGlobal.set(nodeId, globalId);
      this._globalToNode.set(globalId, nodeId);
    }
    this._loadAliveBitmap(shard.shardKey, shard.alive, Ctor);
  }

  /** Loads a LabelShard's data into the reader's label maps. */
  private _loadLabelShard(shard: LabelShard): void {
    for (const [label, id] of shard.labels) {
      this._labelRegistry.set(label, id);
      this._idToLabel.set(id, label);
    }
  }

  /** Loads an EdgeShard's bitmap data into the reader's edge stores. */
  private _loadEdgeShard(shard: EdgeShard, Ctor: RoaringCtor): void {
    const dir = shard.direction;
    const store = dir === 'fwd' ? this._edgeFwd : this._edgeRev;
    const byOwner = dir === 'fwd' ? this._edgeByOwnerFwd : this._edgeByOwnerRev;
    for (const [bucket, entries] of Object.entries(shard.buckets)) {
      for (const [gidStr, bitmapBytes] of Object.entries(entries)) {
        const bitmap = Ctor.deserialize(toBytes(bitmapBytes), true);
        store.set(`${dir}:${bucket}:${gidStr}`, bitmap);
        this._indexByOwner(byOwner, { bucket, gidStr, bitmap });
      }
    }
  }
}
