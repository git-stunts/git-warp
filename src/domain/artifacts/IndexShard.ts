import WarpError from '../errors/WarpError.ts';

/**
 * Abstract base class for index shards.
 *
 * Index builders produce IndexShard subclass instances. The adapter
 * maps each subclass to a Git tree path and CBOR-encodes it. The
 * domain never knows about paths or encoding.
 *
 * Subclasses: MetaShard, EdgeShard, LabelShard, PropertyShard, ReceiptShard.
 */
export class IndexShard {
  /** Shard key identifier. */
  readonly shardKey: string;

  /** Schema version (positive integer). */
  readonly schemaVersion: number;

  constructor({ shardKey, schemaVersion }: { shardKey: string; schemaVersion: number }) {
    _validateShardKey(shardKey);
    _validateSchemaVersion(schemaVersion);
    this.shardKey = shardKey;
    this.schemaVersion = schemaVersion;
  }
}

function _validateShardKey(shardKey: string): void {
  if (typeof shardKey !== 'string' || shardKey.length === 0) {
    throw new WarpError(
      `IndexShard shardKey must be a non-empty string, got ${JSON.stringify(shardKey)}`, // nosemgrep: ts-no-json-stringify-in-core -- 0025B
      'E_INVALID_SHARD',
    );
  }
}

function _validateSchemaVersion(schemaVersion: number): void {
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new WarpError(
      `IndexShard schemaVersion must be a positive integer, got ${JSON.stringify(schemaVersion)}`, // nosemgrep: ts-no-json-stringify-in-core -- 0025B
      'E_INVALID_SHARD',
    );
  }
}
