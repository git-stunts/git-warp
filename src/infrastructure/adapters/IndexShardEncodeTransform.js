import Transform from '../../domain/stream/Transform.js';
import {
  MetaShard,
  EdgeShard,
  LabelShard,
  PropertyShard,
  ReceiptShard,
} from '../../domain/artifacts/IndexShard.js';

/** @typedef {import('../../domain/artifacts/IndexShard.js').IndexShard} IndexShard */
import WarpError from '../../domain/errors/WarpError.ts';

/**
 * Stream transform that maps IndexShard instances to [path, bytes] entries.
 *
 * Owns path mapping (domain → Git tree path) AND CBOR encoding.
 * The adapter knows which IndexShard subclass maps to which path.
 * Domain never touches paths.
 *
 * Input:  IndexShard (MetaShard | EdgeShard | LabelShard | PropertyShard | ReceiptShard)
 * Output: [string, Uint8Array] — [Git tree path, CBOR bytes]
 *
 * @extends {Transform<IndexShard, [string, Uint8Array]>}
 */
export class IndexShardEncodeTransform extends Transform {
  /**
   * Creates an IndexShardEncodeTransform.
   *
   * @param {import('../../ports/CodecPort.ts').default} codec
   */
  constructor(codec) {
    super();
    if (codec === null || codec === undefined) {
      throw new WarpError('IndexShardEncodeTransform requires a codec', 'E_INVALID_DEPENDENCY');
    }
    /** @type {import('../../ports/CodecPort.ts').default} */
    this._codec = codec;
  }

  /**
   * Maps each IndexShard to [path, bytes] via instanceof dispatch.
   *
   * @param {AsyncIterable<IndexShard>} source
   * @returns {AsyncIterable<[string, Uint8Array]>}
   */
  async *apply(source) {
    for await (const shard of source) {
      yield this._encode(shard);
    }
  }

  /**
   * Maps a single IndexShard to [path, bytes].
   *
   * @param {IndexShard} shard
   * @returns {[string, Uint8Array]}
   * @private
   */
  _encode(shard) {
    if (shard instanceof MetaShard) {
      return [
        `meta_${shard.shardKey}.cbor`,
        this._codec.encode({
          nodeToGlobal: shard.nodeToGlobal,
          nextLocalId: shard.nextLocalId,
          alive: shard.alive,
        }),
      ];
    }
    if (shard instanceof EdgeShard) {
      return [
        `${shard.direction}_${shard.shardKey}.cbor`,
        this._codec.encode(shard.buckets),
      ];
    }
    if (shard instanceof LabelShard) {
      return [
        'labels.cbor',
        this._codec.encode(shard.labels),
      ];
    }
    if (shard instanceof PropertyShard) {
      return [
        `props_${shard.shardKey}.cbor`,
        this._codec.encode(shard.entries),
      ];
    }
    if (shard instanceof ReceiptShard) {
      return [
        'receipt.cbor',
        this._codec.encode({
          version: shard.version,
          nodeCount: shard.nodeCount,
          labelCount: shard.labelCount,
          shardCount: shard.shardCount,
        }),
      ];
    }
    throw new WarpError('Unknown IndexShard type', 'E_UNKNOWN_SHARD');
  }
}
