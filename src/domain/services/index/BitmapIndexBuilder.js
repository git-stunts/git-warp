import defaultCodec from '../../utils/defaultCodec.ts';
import { canonicalStringify } from '../../utils/canonicalStringify.ts';
import { textEncode } from '../../utils/bytes.ts';
import BitmapAccumulator from './BitmapAccumulator.ts';

/**
 * Serializes a frontier Map into CBOR and JSON blobs in the given tree.
 * @param {Map<string, string>} frontier - Writer→tip SHA map
 * @param {Record<string, Uint8Array>} tree - Target tree to add entries to
 * @param {import('../../../ports/CodecPort.ts').default} codec - Codec for CBOR serialization
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
 * Pure domain class with no infrastructure dependencies. Delegates ID
 * allocation and bitmap accumulation to BitmapAccumulator. Serializes
 * to CBOR shard format (no envelopes — git-cas handles integrity).
 *
 * @example
 * const builder = new BitmapIndexBuilder();
 * builder.addEdge(parentSha, childSha);
 * const tree = await builder.serialize();
 */
export default class BitmapIndexBuilder {
  /**
   * Creates a new BitmapIndexBuilder instance.
   *
   * @param {{ codec?: import('../../../ports/CodecPort.ts').default }} [options] - Configuration options
   */
  constructor(options = undefined) {
    const { codec } = options ?? {};
    /** @type {import('../../../ports/CodecPort.ts').default} */
    this._codec = codec || defaultCodec;
    this._accumulator = new BitmapAccumulator();
  }

  /** SHA→numeric-ID forward mapping.
   * @returns {Map<string, number>} */
  get shaToId() { return this._accumulator.shaToId; }

  /** Numeric-ID→SHA reverse mapping.
   * @returns {string[]} */
  get idToSha() { return this._accumulator.idToSha; }

  /** Active bitmap map keyed by `{dir}_{sha}`.
   * @returns {Map<string, import('../../utils/roaring.ts').RoaringBitmapSubset>} */
  get bitmaps() { return this._accumulator.bitmaps; }

  /**
   * Registers a node without adding edges.
   * @param {string} sha - The node's SHA
   * @returns {number} The assigned numeric ID
   */
  registerNode(sha) {
    return this._accumulator.registerNode(sha);
  }

  /**
   * Adds a directed edge from source to target node.
   * @param {string} srcSha - Source node SHA (parent)
   * @param {string} tgtSha - Target node SHA (child)
   */
  addEdge(srcSha, tgtSha) {
    this._accumulator.addEdge(srcSha, tgtSha);
  }

  /**
   * Serializes the index to a tree structure of CBOR buffers.
   *
   * Output structure (sharded by SHA prefix):
   * - `meta_XX.cbor`: {sha: id, ...} for SHAs with prefix XX
   * - `shards_fwd_XX.cbor`: {sha: Uint8Array(bitmap), ...} for forward edges
   * - `shards_rev_XX.cbor`: {sha: Uint8Array(bitmap), ...} for reverse edges
   *
   * @param {{ frontier?: Map<string, string> }} [options] - Serialization options
   * @returns {Record<string, Uint8Array>} Map of path → serialized content
   */
  serialize({ frontier } = {}) {
    /** @type {Record<string, Uint8Array>} */
    const tree = {};

    const metaShards = this._accumulator.buildMetaShards();
    for (const [prefix, map] of Object.entries(metaShards)) {
      tree[`meta_${prefix}.cbor`] = this._codec.encode(map);
    }

    const bitmapShards = this._accumulator.serializeBitmapsToShards();
    for (const dir of /** @type {const} */ (['fwd', 'rev'])) {
      for (const [prefix, data] of Object.entries(bitmapShards[dir])) {
        tree[`shards_${dir}_${prefix}.cbor`] = this._codec.encode(data);
      }
    }

    if (frontier !== undefined) {
      serializeFrontierToTree(frontier, tree, this._codec);
    }

    return tree;
  }
}
