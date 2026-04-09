import WarpError from '../errors/WarpError.ts';

/**
 * Abstract base class for index shards.
 *
 * Index builders produce IndexShard subclass instances. The adapter
 * maps each subclass to a Git tree path and CBOR-encodes it. The
 * domain never knows about paths or encoding.
 *
 * Subclasses: MetaShard, EdgeShard, LabelShard, PropertyShard, ReceiptShard.
 *
 * @abstract
 */
export class IndexShard {
  /**
   * Creates an IndexShard.
   * @param {{ shardKey: string, schemaVersion: number }} fields
   */
  constructor({ shardKey, schemaVersion }) {
    if (typeof shardKey !== 'string' || shardKey.length === 0) {
      throw new WarpError(
        `IndexShard shardKey must be a non-empty string, got ${JSON.stringify(shardKey)}`,
        'E_INVALID_SHARD',
      );
    }
    if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
      throw new WarpError(
        `IndexShard schemaVersion must be a positive integer, got ${JSON.stringify(schemaVersion)}`,
        'E_INVALID_SHARD',
      );
    }
    /** @type {string} */
    this.shardKey = shardKey;
    /** @type {number} */
    this.schemaVersion = schemaVersion;
  }
}
