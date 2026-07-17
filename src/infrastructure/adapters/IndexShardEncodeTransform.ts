import Transform from '../../domain/stream/Transform.ts';
import { MetaShard } from '../../domain/artifacts/MetaShard.ts';
import { EdgeShard } from '../../domain/artifacts/EdgeShard.ts';
import { LabelShard } from '../../domain/artifacts/LabelShard.ts';
import { PropertyShard } from '../../domain/artifacts/PropertyShard.ts';
import { ReceiptShard } from '../../domain/artifacts/ReceiptShard.ts';
import type { IndexShard } from '../../domain/artifacts/IndexShard.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import { requirePropertyShardEncodedSize } from './PropertyShardEncodedSizeGuard.ts';

type IndexShardEncodeOptions = Readonly<{
  maxBytes?: number;
}>;

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
  private readonly _maxBytes: number | undefined;

  constructor(codec: CodecPort, options: IndexShardEncodeOptions = {}) {
    super();
    if (codec === null || codec === undefined) {
      throw new WarpError('IndexShardEncodeTransform requires a codec', 'E_INVALID_DEPENDENCY');
    }
    this._codec = codec;
    this._maxBytes = options.maxBytes;
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
      const path = `props_${shard.shardKey}.cbor`;
      if (this._maxBytes !== undefined) {
        requirePropertyShardEncodedSize(shard, path, this._maxBytes);
      }
      return [
        path,
        this._codec.encode(propertyShardPayload(shard)),
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

function propertyShardPayload(
  shard: PropertyShard,
): PropertyShard['entries'] | {
  readonly schemaVersion: 2;
  readonly entries: Array<[string, Array<[string, unknown]>]>; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
} {
  if (shard.schemaVersion === 1) {
    return shard.entries;
  }
  if (shard.schemaVersion !== 2) {
    throw new WarpError(
      `Unsupported property shard schema version: ${String(shard.schemaVersion)}`,
      'E_INDEX_SHARD_SCHEMA',
    );
  }
  return {
    schemaVersion: 2,
    entries: shard.entries.map(([nodeId, properties]) => [
      nodeId,
      Object.entries(properties).sort(([left], [right]) => compareStrings(left, right)),
    ]),
  };
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
