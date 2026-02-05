import { createHash } from 'crypto';
import { getRoaringBitmap32, getNativeRoaringAvailable } from '../utils/roaring.js';
import { canonicalStringify } from '../utils/canonicalStringify.js';
import { encode as cborEncode } from '../../infrastructure/codecs/CborCodec.js';

/**
 * Shard format version for forward compatibility.
 * Increment when changing the shard structure.
 * @const {number}
 */
export const SHARD_VERSION = 2;

/**
 * Computes a SHA-256 checksum of the given data.
 * Uses canonical JSON stringification for deterministic output
 * across different JavaScript engines.
 *
 * @param {Object} data - The data object to checksum
 * @returns {string} Hex-encoded SHA-256 hash
 */
const computeChecksum = (data) => {
  const json = canonicalStringify(data);
  return createHash('sha256').update(json).digest('hex');
};

/** @type {boolean|null} Whether native Roaring bindings are available (null = unknown until first use) */
export let NATIVE_ROARING_AVAILABLE = null;

const ensureRoaringBitmap32 = () => {
  const RoaringBitmap32 = getRoaringBitmap32();
  if (NATIVE_ROARING_AVAILABLE === null) {
    NATIVE_ROARING_AVAILABLE = getNativeRoaringAvailable();
  }
  return RoaringBitmap32;
};

/**
 * Wraps data in a version/checksum envelope.
 * @param {Object} data - The data to wrap
 * @returns {Object} Envelope with version, checksum, and data
 */
const wrapShard = (data) => ({
  version: SHARD_VERSION,
  checksum: computeChecksum(data),
  data,
});

/**
 * Serializes a frontier Map into CBOR and JSON blobs in the given tree.
 * @param {Map<string, string>} frontier - Writer→tip SHA map
 * @param {Record<string, Buffer>} tree - Target tree to add entries to
 */
function serializeFrontierToTree(frontier, tree) {
  const sorted = {};
  for (const key of Array.from(frontier.keys()).sort()) {
    sorted[key] = frontier.get(key);
  }
  const envelope = { version: 1, writerCount: frontier.size, frontier: sorted };
  tree['frontier.cbor'] = Buffer.from(cborEncode(envelope));
  tree['frontier.json'] = Buffer.from(canonicalStringify(envelope));
}

/**
 * Builder for constructing bitmap indexes in memory.
 *
 * This is a pure domain class with no infrastructure dependencies.
 * Create an instance, add nodes and edges, then serialize to persist.
 *
 * **Performance Note**: Uses Roaring Bitmaps for compression. Native bindings
 * provide best performance. Check `NATIVE_ROARING_AVAILABLE` export if
 * performance is critical.
 *
 * @example
 * import BitmapIndexBuilder, { NATIVE_ROARING_AVAILABLE } from './BitmapIndexBuilder.js';
 * if (NATIVE_ROARING_AVAILABLE === false) {
 *   console.warn('Consider installing native Roaring bindings for better performance');
 * }
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
   */
  constructor() {
    /** @type {Map<string, number>} */
    this.shaToId = new Map();
    /** @type {string[]} */
    this.idToSha = [];
    /** @type {Map<string, RoaringBitmap32>} */
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
   * @returns {Record<string, Buffer>} Map of path → serialized content
   */
  serialize({ frontier } = {}) {
    const tree = {};

    // Serialize ID mappings (sharded by prefix)
    const idShards = {};
    for (const [sha, id] of this.shaToId) {
      const prefix = sha.substring(0, 2);
      if (!idShards[prefix]) {
        idShards[prefix] = {};
      }
      idShards[prefix][sha] = id;
    }
    for (const [prefix, map] of Object.entries(idShards)) {
      tree[`meta_${prefix}.json`] = Buffer.from(JSON.stringify(wrapShard(map)));
    }

    // Serialize bitmaps (sharded by prefix, per-node within shard)
    // Keys are constructed as '${type}_${sha}' by _addToBitmap (e.g., 'fwd_abc123', 'rev_def456')
    const bitmapShards = { fwd: {}, rev: {} };
    for (const [key, bitmap] of this.bitmaps) {
      const [type, sha] = [key.substring(0, 3), key.substring(4)];
      const prefix = sha.substring(0, 2);

      if (!bitmapShards[type][prefix]) {
        bitmapShards[type][prefix] = {};
      }
      // Encode bitmap as base64 for JSON storage
      bitmapShards[type][prefix][sha] = bitmap.serialize(true).toString('base64');
    }

    for (const type of ['fwd', 'rev']) {
      for (const [prefix, shardData] of Object.entries(bitmapShards[type])) {
        tree[`shards_${type}_${prefix}.json`] = Buffer.from(JSON.stringify(wrapShard(shardData)));
      }
    }

    if (frontier) {
      serializeFrontierToTree(frontier, tree);
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
      return this.shaToId.get(sha);
    }
    const id = this.idToSha.length;
    this.idToSha.push(sha);
    this.shaToId.set(sha, id);
    return id;
  }

  /**
   * Adds an ID to a node's bitmap.
   * @param {Object} opts - Options
   * @param {string} opts.sha - The SHA to use as key
   * @param {number} opts.id - The ID to add to the bitmap
   * @param {string} opts.type - 'fwd' or 'rev'
   * @private
   */
  _addToBitmap({ sha, id, type }) {
    const key = `${type}_${sha}`;
    if (!this.bitmaps.has(key)) {
      const RoaringBitmap32 = ensureRoaringBitmap32();
      this.bitmaps.set(key, new RoaringBitmap32());
    }
    this.bitmaps.get(key).add(id);
  }
}
