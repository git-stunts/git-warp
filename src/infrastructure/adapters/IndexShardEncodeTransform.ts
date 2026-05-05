import Transform from '../../domain/stream/Transform.ts';
import { MetaShard } from '../../domain/artifacts/MetaShard.ts';
import { EdgeShard } from '../../domain/artifacts/EdgeShard.ts';
import { LabelShard } from '../../domain/artifacts/LabelShard.ts';
import { PropertyShard } from '../../domain/artifacts/PropertyShard.ts';
import { ReceiptShard } from '../../domain/artifacts/ReceiptShard.ts';
import type { IndexShard } from '../../domain/artifacts/IndexShard.ts';
import type CodecPort from '../../ports/CodecPort.ts';
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
 */
export class IndexShardEncodeTransform extends Transform<IndexShard, [string, Uint8Array]> {
  private readonly _codec: CodecPort;

  constructor(codec: CodecPort) {
    super();
    if (codec === null || codec === undefined) {
      throw new WarpError('IndexShardEncodeTransform requires a codec', 'E_INVALID_DEPENDENCY');
    }
    this._codec = codec;
  }

  override async *apply(source: AsyncIterable<IndexShard>): AsyncIterable<[string, Uint8Array]> {
    for await (const shard of source) {
      yield this._encode(shard);
    }
  }

  /**
   * Maps a single IndexShard to [path, bytes].
   */
  private _encode(shard: IndexShard): [string, Uint8Array] {
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
