/**
 * Builds property index shards from node properties.
 *
 * Produces `props_XX.cbor` shards keyed by shard key, where each
 * shard maps nodeId → { key: value, ... }.
 *
 * @module domain/services/index/PropertyIndexBuilder
 */

import computeShardKey from '../../utils/shardKey.ts';
import { PropertyShard } from '../../artifacts/PropertyShard.ts';

/**
 * Creates a null-prototype object typed as Record<string, unknown>. // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
 */
function createNullProtoRecord(): Record<string, unknown> { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return Object.create(null) as Record<string, unknown>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
}

export default class PropertyIndexBuilder {
  private readonly _shards: Map<string, Map<string, Record<string, unknown>>>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  private readonly _shardKey: (nodeId: string) => string;
  private readonly _schemaVersion: number;

  constructor(options: {
    readonly schemaVersion?: number;
    readonly shardKey?: (nodeId: string) => string;
  } = {}) {
    /** shardKey → (nodeId → props) */
    this._shards = new Map();
    this._shardKey = options.shardKey ?? computeShardKey;
    this._schemaVersion = options.schemaVersion ?? 1;
  }

  /**
   * Adds a property for a node.
   */
  addProperty(nodeId: string, key: string, value: unknown): void { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    const shardKey = this._shardKey(nodeId);
    let shard = this._shards.get(shardKey);
    if (!shard) {
      shard = new Map();
      this._shards.set(shardKey, shard);
    }
    let nodeProps = shard.get(nodeId);
    if (!nodeProps) {
      nodeProps = createNullProtoRecord();
      shard.set(nodeId, nodeProps);
    }
    nodeProps[key] = value;
  }

  /** Number of physical property shards that will be emitted. */
  shardCount(): number {
    return this._shards.size;
  }

  /**
   * Yields PropertyShard instances without encoding.
   */
  *yieldShards(): Generator<PropertyShard> {
    for (const [shardKey, shard] of this._shards) {
      const entries = [...shard.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([nodeId, props]): [string, Record<string, unknown>] => [nodeId, props]); // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
      yield new PropertyShard({ shardKey, schemaVersion: this._schemaVersion, entries });
    }
  }
}
