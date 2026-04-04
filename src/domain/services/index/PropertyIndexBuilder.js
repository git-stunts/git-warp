/**
 * Builds property index shards from node properties.
 *
 * Produces `props_XX.cbor` shards keyed by shard key, where each
 * shard maps nodeId → { key: value, ... }.
 *
 * @module domain/services/index/PropertyIndexBuilder
 */

import defaultCodec from '../../utils/defaultCodec.js';
import computeShardKey from '../../utils/shardKey.js';
import { PropertyShard } from '../../artifacts/IndexShard.js';

/**
 * Creates a null-prototype object typed as Record<string, unknown>.
 *
 * @returns {Record<string, unknown>}
 */
function createNullProtoRecord() {
  /** @type {unknown} */
  const obj = Object.create(null);
  return /** @type {Record<string, unknown>} */ (obj);
}

export default class PropertyIndexBuilder {
  /**
   * Creates a PropertyIndexBuilder with an optional codec for serialization.
   *
   * @param {{ codec?: import('../../../ports/CodecPort.js').default }} [options]
   */
  constructor(options = undefined) {
    const { codec } = options || {};
    this._codec = codec || defaultCodec;
    /** @type {Map<string, Map<string, Record<string, unknown>>>} shardKey → (nodeId → props) */
    this._shards = new Map();
  }

  /**
   * Adds a property for a node.
   *
   * @param {string} nodeId
   * @param {string} key
   * @param {unknown} value
   */
  addProperty(nodeId, key, value) {
    const shardKey = computeShardKey(nodeId);
    let shard = this._shards.get(shardKey);
    if (!shard) {
      shard = new Map();
      this._shards.set(shardKey, shard);
    }
    let nodeProps = /** @type {Record<string, unknown>|undefined} */ (
      /** @type {unknown} */ (shard.get(nodeId))
    );
    if (!nodeProps) {
      nodeProps = createNullProtoRecord();
      shard.set(nodeId, nodeProps);
    }
    /** @type {Record<string, unknown>} */ (nodeProps)[key] = value;
  }

  /**
   * Serializes all property shards.
   *
   * @returns {Record<string, Uint8Array>}
   */
  serialize() {
    /** @type {Record<string, Uint8Array>} */
    const tree = {};
    for (const [shardKey, shard] of this._shards) {
      const entries = [...shard.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([nodeId, props]) => [nodeId, props]);
      tree[`props_${shardKey}.cbor`] = this._codec.encode(entries).slice();
    }
    return tree;
  }

  /**
   * Yields PropertyShard instances without encoding.
   *
   * @returns {Generator<PropertyShard>}
   */
  *yieldShards() {
    for (const [shardKey, shard] of this._shards) {
      const entries = [...shard.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([nodeId, props]) => [nodeId, props]);
      yield new PropertyShard({
        shardKey,
        entries: /** @type {Array<[string, Record<string, unknown>]>} */ (entries),
      });
    }
  }
}
