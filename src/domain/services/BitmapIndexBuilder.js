import roaring from 'roaring';
const { RoaringBitmap32 } = roaring;

/**
 * Builder for constructing bitmap indexes in memory.
 *
 * This is a pure domain class with no infrastructure dependencies.
 * Create an instance, add nodes and edges, then serialize to persist.
 *
 * @example
 * const builder = new BitmapIndexBuilder();
 * builder.registerNode('abc123');
 * builder.addEdge('parent-sha', 'child-sha');
 * const treeStructure = builder.serialize();
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
   * - `meta_XX.json`: {sha: id, ...} for SHAs with prefix XX
   * - `shards_fwd_XX.json`: {sha: base64Bitmap, ...} for forward edges
   * - `shards_rev_XX.json`: {sha: base64Bitmap, ...} for reverse edges
   *
   * @returns {Record<string, Buffer>} Map of path → serialized content
   */
  serialize() {
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
      tree[`meta_${prefix}.json`] = Buffer.from(JSON.stringify(map));
    }

    // Serialize bitmaps (sharded by prefix, per-node within shard)
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
        tree[`shards_${type}_${prefix}.json`] = Buffer.from(JSON.stringify(shardData));
      }
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
      this.bitmaps.set(key, new RoaringBitmap32());
    }
    this.bitmaps.get(key).add(id);
  }
}
