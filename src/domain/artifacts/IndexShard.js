import WarpError from '../errors/WarpError.js';

/**
 * Abstract base class for index shards.
 *
 * Index builders produce IndexShard subclass instances. The adapter
 * maps each subclass to a Git tree path and CBOR-encodes it. The
 * domain never knows about paths or encoding.
 *
 * Subclasses: MetaShard, EdgeShard, LabelShard, PropertyShard,
 * ReceiptShard.
 *
 * @abstract
 */
export class IndexShard {
  /**
   * Creates an IndexShard.
   *
   * @param {{ shardKey: string, schemaVersion: number }} fields
   */
  constructor({ shardKey, schemaVersion }) {
    if (typeof shardKey !== 'string') {
      throw new WarpError(
        `IndexShard shardKey must be a string, got ${typeof shardKey}`,
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

/**
 * Node-to-global-ID mappings + alive bitmap for a shard.
 */
export class MetaShard extends IndexShard {
  /**
   * Creates a MetaShard.
   *
   * @param {{ shardKey: string, schemaVersion?: number, nodeToGlobal: Array<[string, number]>, nextLocalId: number, alive: Uint8Array }} fields
   */
  constructor({ shardKey, schemaVersion = 1, nodeToGlobal, nextLocalId, alive }) {
    super({ shardKey, schemaVersion });
    /** @type {Array<[string, number]>} */
    this.nodeToGlobal = nodeToGlobal;
    /** @type {number} */
    this.nextLocalId = nextLocalId;
    /** @type {Uint8Array} */
    this.alive = alive;
    Object.freeze(this);
  }
}

/**
 * Forward or reverse edge bitmaps for a shard.
 */
export class EdgeShard extends IndexShard {
  /**
   * Creates an EdgeShard.
   *
   * @param {{ shardKey: string, schemaVersion?: number, direction: 'fwd'|'rev', buckets: Record<string, Record<string, Uint8Array>> }} fields
   */
  constructor({ shardKey, schemaVersion = 1, direction, buckets }) {
    super({ shardKey, schemaVersion });
    if (direction !== 'fwd' && direction !== 'rev') {
      throw new WarpError(
        `EdgeShard direction must be 'fwd' or 'rev', got ${JSON.stringify(direction)}`,
        'E_INVALID_SHARD',
      );
    }
    /** @type {'fwd'|'rev'} */
    this.direction = direction;
    /** @type {Record<string, Record<string, Uint8Array>>} */
    this.buckets = buckets;
    Object.freeze(this);
  }
}

/**
 * Label registry (append-only label-to-ID mapping).
 */
export class LabelShard extends IndexShard {
  /**
   * Creates a LabelShard.
   *
   * @param {{ shardKey?: string, schemaVersion?: number, labels: Array<[string, number]> }} fields
   */
  constructor({ shardKey = 'global', schemaVersion = 1, labels }) {
    super({ shardKey, schemaVersion });
    /** @type {Array<[string, number]>} */
    this.labels = labels;
    Object.freeze(this);
  }
}

/**
 * Property index data for a shard.
 */
export class PropertyShard extends IndexShard {
  /**
   * Creates a PropertyShard.
   *
   * @param {{ shardKey: string, schemaVersion?: number, entries: Array<[string, Record<string, unknown>]> }} fields
   */
  constructor({ shardKey, schemaVersion = 1, entries }) {
    super({ shardKey, schemaVersion });
    /** @type {Array<[string, Record<string, unknown>]>} */
    this.entries = entries;
    Object.freeze(this);
  }
}

/**
 * Build metadata receipt.
 */
export class ReceiptShard extends IndexShard {
  /**
   * Creates a ReceiptShard.
   *
   * @param {{ shardKey?: string, schemaVersion?: number, version: number, nodeCount: number, labelCount: number, shardCount: number }} fields
   */
  constructor({ shardKey = 'receipt', schemaVersion = 1, version, nodeCount, labelCount, shardCount }) {
    super({ shardKey, schemaVersion });
    /** @type {number} */
    this.version = version;
    /** @type {number} */
    this.nodeCount = nodeCount;
    /** @type {number} */
    this.labelCount = labelCount;
    /** @type {number} */
    this.shardCount = shardCount;
    Object.freeze(this);
  }
}
