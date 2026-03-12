import defaultCodec from '../utils/defaultCodec.js';
import defaultCrypto from '../utils/defaultCrypto.js';
import { computeChecksum } from '../utils/checksumUtils.js';
import { getRoaringBitmap32, getNativeRoaringAvailable } from '../utils/roaring.js';
import { canonicalStringify } from '../utils/canonicalStringify.js';
import { SHARD_VERSION } from '../utils/shardVersion.js';
import { textEncode, base64Encode } from '../utils/bytes.js';

// Re-export for backwards compatibility
export { SHARD_VERSION };

/** @type {boolean|null} Whether native Roaring bindings are available (null = unknown until first use) */
let _nativeRoaringAvailable = null;

/**
 * Resets native Roaring availability detection (test-only utility).
 * @returns {void}
 */
export function resetNativeRoaringFlag() {
  _nativeRoaringAvailable = null;
}

const ensureRoaringBitmap32 = () => {
  const RoaringBitmap32 = getRoaringBitmap32();
  if (_nativeRoaringAvailable === null) {
    _nativeRoaringAvailable = getNativeRoaringAvailable();
  }
  return RoaringBitmap32;
};

/**
 * Wraps data in a version/checksum envelope.
 * @param {Record<string, unknown>} data - The data to wrap
 * @param {import('../../ports/CryptoPort.js').default} crypto - CryptoPort instance
 * @returns {Promise<{version: number, checksum: string, data: Record<string, unknown>}>} Envelope with version, checksum, and data
 */
const wrapShard = async (data, crypto) => ({
  version: SHARD_VERSION,
  checksum: await computeChecksum(data, crypto),
  data,
});

/**
 * Serializes a frontier Map into CBOR and JSON blobs in the given tree.
 * @param {Map<string, string>} frontier - Writer→tip SHA map
 * @param {Record<string, Uint8Array>} tree - Target tree to add entries to
 * @param {import('../../ports/CodecPort.js').default} codec - Codec for CBOR serialization
 */
function serializeFrontierToTree(frontier, tree, codec) {
  /** @type {Record<string, string|undefined>} */
  const sorted = {};
  for (const key of Array.from(frontier.keys()).sort()) {
    sorted[key] = frontier.get(key);
  }
  const envelope = { version: 1, writerCount: frontier.size, frontier: sorted };
  tree['frontier.cbor'] = codec.encode(envelope);
  tree['frontier.json'] = textEncode(canonicalStringify(envelope));
}

/**
 * Builder for constructing bitmap indexes in memory.
 *
 * This is a pure domain class with no infrastructure dependencies.
 * Create an instance, add nodes and edges, then serialize to persist.
 *
 * Callers that persist the serialized output typically need
 * BlobPort + TreePort + RefPort from the persistence layer.
 *
 * **Performance Note**: Uses Roaring Bitmaps for compression. Native bindings
 * provide best performance. Use `getNativeRoaringAvailable()` from
 * `src/domain/utils/roaring.js` if runtime capability checks are needed.
 *
 * @example
 * import BitmapIndexBuilder from './BitmapIndexBuilder.js';
 * const builder = new BitmapIndexBuilder();
 */
export default class BitmapIndexBuilder {
  /**
   * Creates a new BitmapIndexBuilder instance.
   *
   * The builder tracks:
   * - SHA to numeric ID mappings (for compact bitmap storage)
   * - Forward edge bitmaps (parent → children)
   * - Reverse edge bitmaps (child → parents)
   *
   * @param {{ crypto?: import('../../ports/CryptoPort.js').default, codec?: import('../../ports/CodecPort.js').default }} [options] - Configuration options
   */
  constructor(options = undefined) {
    const { crypto, codec } = options || {};
    /** @type {import('../../ports/CryptoPort.js').default} */
    this._crypto = crypto || defaultCrypto;
    /** @type {import('../../ports/CodecPort.js').default} */
    this._codec = codec || defaultCodec;
    /** @type {Map<string, number>} */
    this.shaToId = new Map();
    /** @type {string[]} */
    this.idToSha = [];
    /** @type {Map<string, import('../utils/roaring.js').RoaringBitmapSubset>} */
    this.bitmaps = new Map();
  }

  /**
   * Registers a node without adding edges.
   * Useful for root nodes with no parents.
   *
   * @param {string} sha - The node's SHA
   * @returns {number} The assigned numeric ID
   */
  registerNode(sha) {
    return this._getOrCreateId(sha);
  }

  /**
   * Adds a directed edge from source to target node.
   *
   * Updates both forward (src → tgt) and reverse (tgt → src) bitmaps.
   *
   * @param {string} srcSha - Source node SHA (parent)
   * @param {string} tgtSha - Target node SHA (child)
   * @returns {void}
   */
  addEdge(srcSha, tgtSha) {
    const srcId = this._getOrCreateId(srcSha);
    const tgtId = this._getOrCreateId(tgtSha);
    this._addToBitmap({ sha: srcSha, id: tgtId, type: 'fwd' });
    this._addToBitmap({ sha: tgtSha, id: srcId, type: 'rev' });
  }

  /**
   * Serializes the index to a tree structure of buffers.
   *
   * Output structure (sharded by SHA prefix for lazy loading):
   * - `meta_XX.json`: {version, checksum, data: {sha: id, ...}} for SHAs with prefix XX
   * - `shards_fwd_XX.json`: {version, checksum, data: {sha: base64Bitmap, ...}} for forward edges
   * - `shards_rev_XX.json`: {version, checksum, data: {sha: base64Bitmap, ...}} for reverse edges
   *
   * Each shard is wrapped in a version/checksum envelope for integrity verification.
   *
   * @param {{ frontier?: Map<string, string> }} [options] - Serialization options
   * @returns {Promise<Record<string, Uint8Array>>} Map of path → serialized content
   */
  async serialize({ frontier } = {}) {
    /** @type {Record<string, Uint8Array>} */
    const tree = {};

    // Serialize ID mappings (sharded by prefix)
    /** @type {Record<string, Record<string, number>>} */
    const idShards = {};
    for (const [sha, id] of this.shaToId) {
      const prefix = sha.substring(0, 2);
      if (!idShards[prefix]) {
        idShards[prefix] = {};
      }
      idShards[prefix][sha] = id;
    }
    for (const [prefix, map] of Object.entries(idShards)) {
      tree[`meta_${prefix}.json`] = textEncode(JSON.stringify(await wrapShard(map, this._crypto)));
    }

    // Serialize bitmaps (sharded by prefix, per-node within shard)
    // Keys are constructed as '${type}_${sha}' by _addToBitmap (e.g., 'fwd_abc123', 'rev_def456')
    /** @type {Record<string, Record<string, Record<string, string>>>} */
    const bitmapShards = { fwd: {}, rev: {} };
    for (const [key, bitmap] of this.bitmaps) {
      const [type, sha] = [key.substring(0, 3), key.substring(4)];
      const prefix = sha.substring(0, 2);

      if (!bitmapShards[type][prefix]) {
        bitmapShards[type][prefix] = {};
      }
      // Encode bitmap as base64 for JSON storage
      bitmapShards[type][prefix][sha] = base64Encode(new Uint8Array(bitmap.serialize(true)));
    }

    for (const type of ['fwd', 'rev']) {
      for (const [prefix, shardData] of Object.entries(bitmapShards[type])) {
        tree[`shards_${type}_${prefix}.json`] = textEncode(JSON.stringify(await wrapShard(shardData, this._crypto)));
      }
    }

    if (frontier) {
      serializeFrontierToTree(frontier, tree, this._codec);
    }

    return tree;
  }

  /**
   * Gets or creates a numeric ID for a SHA.
   * @param {string} sha - The SHA to look up or register
   * @returns {number} The numeric ID
   * @private
   */
  _getOrCreateId(sha) {
    if (this.shaToId.has(sha)) {
      return /** @type {number} */ (this.shaToId.get(sha));
    }
    const id = this.idToSha.length;
    this.idToSha.push(sha);
    this.shaToId.set(sha, id);
    return id;
  }

  /**
   * Adds an ID to a node's bitmap.
   * @param {{ sha: string, id: number, type: string }} opts - Options
   * @private
   */
  _addToBitmap({ sha, id, type }) {
    const key = `${type}_${sha}`;
    if (!this.bitmaps.has(key)) {
      const RoaringBitmap32 = ensureRoaringBitmap32();
      this.bitmaps.set(key, new RoaringBitmap32());
    }
    /** @type {import('../utils/roaring.js').RoaringBitmapSubset} */ (this.bitmaps.get(key)).add(id);
  }
}
