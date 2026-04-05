import IndexStorePort from '../../ports/IndexStorePort.js';
import WarpError from '../../domain/errors/WarpError.js';
import WarpStream from '../../domain/stream/WarpStream.js';
import {
  MetaShard,
  EdgeShard,
  LabelShard,
  PropertyShard,
  ReceiptShard,
} from '../../domain/artifacts/IndexShard.js';
import { IndexShardEncodeTransform } from './IndexShardEncodeTransform.js';
import { GitBlobWriteTransform } from './GitBlobWriteTransform.js';
import { TreeAssemblerSink } from './TreeAssemblerSink.js';

/**
 * Regex patterns for classifying index tree paths to IndexShard subclasses.
 *
 * Path format mirrors IndexShardEncodeTransform._encode():
 *   MetaShard    → meta_<shardKey>.cbor
 *   EdgeShard    → fwd_<shardKey>.cbor | rev_<shardKey>.cbor
 *   LabelShard   → labels.cbor
 *   PropertyShard→ props_<shardKey>.cbor
 *   ReceiptShard → receipt.cbor
 *
 * @type {ReadonlyArray<{ pattern: RegExp, classify: (match: RegExpMatchArray, data: unknown) => import('../../domain/artifacts/IndexShard.js').IndexShard }>}
 */
const SHARD_CLASSIFIERS = Object.freeze([
  {
    pattern: /^meta_([0-9a-f]+)\.cbor$/,
    classify: (match, data) => {
      const d = /** @type {{ nodeToGlobal: Array<[string, number]>, nextLocalId: number, alive: Uint8Array }} */ (data);
      return new MetaShard({
        shardKey: /** @type {string} */ (match[1]),
        nodeToGlobal: d.nodeToGlobal,
        nextLocalId: d.nextLocalId,
        alive: d.alive,
      });
    },
  },
  {
    pattern: /^(fwd|rev)_([0-9a-f]+)\.cbor$/,
    classify: (match, data) => new EdgeShard({
      shardKey: /** @type {string} */ (match[2]),
      direction: /** @type {'fwd'|'rev'} */ (match[1]),
      buckets: /** @type {Record<string, Record<string, Uint8Array>>} */ (data),
    }),
  },
  {
    pattern: /^labels\.cbor$/,
    classify: (_match, data) => new LabelShard({
      labels: /** @type {Array<[string, number]>} */ (data),
    }),
  },
  {
    pattern: /^props_([0-9a-f]+)\.cbor$/,
    classify: (match, data) => new PropertyShard({
      shardKey: /** @type {string} */ (match[1]),
      entries: /** @type {Array<[string, Record<string, unknown>]>} */ (data),
    }),
  },
  {
    pattern: /^receipt\.cbor$/,
    classify: (_match, data) => {
      const d = /** @type {{ version: number, nodeCount: number, labelCount: number, shardCount: number }} */ (data);
      return new ReceiptShard({
        version: d.version,
        nodeCount: d.nodeCount,
        labelCount: d.labelCount,
        shardCount: d.shardCount,
      });
    },
  },
]);

/**
 * CBOR-backed implementation of IndexStorePort.
 *
 * Owns the codec and raw Git persistence. Domain services produce
 * IndexShard streams; the adapter encodes, writes blobs, and
 * assembles Git trees. On read, the adapter decodes blobs and
 * constructs IndexShard subclass instances.
 *
 * Write pipeline reuses existing infrastructure transforms:
 *   WarpStream<IndexShard>
 *     → IndexShardEncodeTransform → [path, bytes]
 *     → GitBlobWriteTransform     → [path, oid]
 *     → TreeAssemblerSink         → tree OID
 *
 * @extends IndexStorePort
 */
export class CborIndexStoreAdapter extends IndexStorePort {
  /**
   * Creates a CborIndexStoreAdapter.
   *
   * @param {{
   *   codec: import('../../ports/CodecPort.js').default,
   *   blobPort: import('../../ports/BlobPort.js').default,
   *   treePort: import('../../ports/TreePort.js').default,
   * }} options
   */
  constructor({ codec, blobPort, treePort }) {
    super();
    if (codec === null || codec === undefined) {
      throw new WarpError('CborIndexStoreAdapter requires a codec', 'E_INVALID_DEPENDENCY');
    }
    if (blobPort === null || blobPort === undefined) {
      throw new WarpError('CborIndexStoreAdapter requires a blobPort', 'E_INVALID_DEPENDENCY');
    }
    if (treePort === null || treePort === undefined) {
      throw new WarpError('CborIndexStoreAdapter requires a treePort', 'E_INVALID_DEPENDENCY');
    }
    /** @type {import('../../ports/CodecPort.js').default} */
    this._codec = codec;
    /** @type {import('../../ports/BlobPort.js').default} */
    this._blobPort = blobPort;
    /** @type {import('../../ports/TreePort.js').default} */
    this._treePort = treePort;
  }

  /**
   * Persists a stream of IndexShard records as a Git tree.
   *
   * Composes the existing infrastructure pipeline:
   * IndexShardEncodeTransform → GitBlobWriteTransform → TreeAssemblerSink
   *
   * @param {import('../../domain/stream/WarpStream.js').default<import('../../domain/artifacts/IndexShard.js').IndexShard>} shardStream
   * @returns {Promise<string>} The Git tree OID
   */
  async writeShards(shardStream) {
    return await shardStream
      .pipe(new IndexShardEncodeTransform(this._codec))
      .pipe(new GitBlobWriteTransform(this._blobPort))
      .drain(new TreeAssemblerSink(this._treePort));
  }

  /**
   * Scans all shards in an index tree, yielding IndexShard records.
   *
   * Reads the tree directory, then lazily decodes each blob and
   * constructs the appropriate IndexShard subclass based on the
   * path pattern.
   *
   * @param {string} treeOid - The index tree OID
   * @returns {import('../../domain/stream/WarpStream.js').default<import('../../domain/artifacts/IndexShard.js').IndexShard>}
   */
  scanShards(treeOid) {
    const adapter = this;
    return WarpStream.from((async function* () {
      const oids = await adapter._treePort.readTreeOids(treeOid);
      const paths = Object.keys(oids).sort();

      for (const path of paths) {
        const blobOid = /** @type {string} */ (oids[path]);
        const bytes = await adapter._blobPort.readBlob(blobOid);
        const data = adapter._codec.decode(bytes);
        const shard = classifyPath(path, data);
        yield shard;
      }
    })());
  }

  /**
   * Reads the path→OID mapping from an index tree.
   *
   * @param {string} treeOid - The index tree OID
   * @returns {Promise<Record<string, string>>}
   */
  async readShardOids(treeOid) {
    return await this._treePort.readTreeOids(treeOid);
  }

  /**
   * Reads and decodes a single shard blob by OID.
   *
   * @param {string} blobOid - The blob OID to read
   * @returns {Promise<unknown>}
   */
  async decodeShard(blobOid) {
    const bytes = await this._blobPort.readBlob(blobOid);
    return this._codec.decode(bytes);
  }
}

/**
 * Classifies a tree path into the appropriate IndexShard subclass.
 *
 * @param {string} path - Git tree path (e.g., "meta_a0.cbor")
 * @param {unknown} data - Decoded shard data
 * @returns {import('../../domain/artifacts/IndexShard.js').IndexShard}
 * @throws {WarpError} If the path doesn't match any known shard pattern
 */
function classifyPath(path, data) {
  for (const { pattern, classify } of SHARD_CLASSIFIERS) {
    const match = path.match(pattern);
    if (match) {
      return classify(match, data);
    }
  }
  throw new WarpError(`Unknown index shard path: ${path}`, 'E_UNKNOWN_SHARD');
}
