import Transform from '../../domain/stream/Transform.ts';
import { MetaShard } from '../../domain/artifacts/MetaShard.ts';
import { EdgeShard } from '../../domain/artifacts/EdgeShard.ts';
import { LabelShard } from '../../domain/artifacts/LabelShard.ts';
import { PropertyShard } from '../../domain/artifacts/PropertyShard.ts';
import { ReceiptShard } from '../../domain/artifacts/ReceiptShard.ts';
import { NodeLifecycleReceipt } from '../../domain/artifacts/NodeLifecycleReceipt.ts';
import {
  NODE_LIFECYCLE_SHARD_SCHEMA_VERSION,
  NodeLifecycleShard,
} from '../../domain/artifacts/NodeLifecycleShard.ts';
import {
  NODE_LIFECYCLE_RECEIPT_PATH,
  nodeLifecycleShardPathForKey,
} from '../../domain/services/index/NodeLifecycleShardReader.ts';
import { nodeLifecycleShardPayload } from './NodeLifecycleShardPayload.ts';
import type { IndexShard } from '../../domain/artifacts/IndexShard.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import { requirePropertyShardEncodedSize } from './PropertyShardEncodedSizeGuard.ts';
import {
  validateBoundedCbor,
  type CborStructureLimits,
} from './BoundedCborValidation.ts';

type IndexShardEncodeOptions = Readonly<{
  maxBytes?: number;
  structureLimits?: CborStructureLimits;
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
  private readonly _structureLimits: CborStructureLimits | undefined;

  constructor(codec: CodecPort, options: IndexShardEncodeOptions = {}) {
    super();
    if (codec === null || codec === undefined) {
      throw new WarpError('IndexShardEncodeTransform requires a codec', 'E_INVALID_DEPENDENCY');
    }
    this._codec = codec;
    this._maxBytes = options.maxBytes;
    this._structureLimits = options.structureLimits;
  }

  override async *apply(source: AsyncIterable<IndexShard>): AsyncIterable<[string, Uint8Array]> {
    for await (const shard of source) {
      yield this.encodeShard(shard);
    }
  }

  /**
   * Maps a single IndexShard to [path, bytes].
   */
  encodeShard(shard: IndexShard): [string, Uint8Array] {
    if (shard instanceof MetaShard) {
      return this._encodePayload(
        `meta_${shard.shardKey}.cbor`,
        {
          nodeToGlobal: shard.nodeToGlobal,
          nextLocalId: shard.nextLocalId,
          alive: shard.alive,
        },
      );
    }
    if (shard instanceof EdgeShard) {
      return this._encodePayload(
        `${shard.direction}_${shard.shardKey}.cbor`,
        shard.buckets,
      );
    }
    if (shard instanceof LabelShard) {
      return this._encodePayload('labels.cbor', shard.labels);
    }
    if (shard instanceof PropertyShard) {
      const path = `props_${shard.shardKey}.cbor`;
      if (this._maxBytes !== undefined) {
        requirePropertyShardEncodedSize(shard, path, this._maxBytes);
      }
      return this._encodePayload(path, propertyShardPayload(shard));
    }
    if (shard instanceof NodeLifecycleShard) {
      return this._encodePayload(
        nodeLifecycleShardPathForKey(shard.shardKey),
        nodeLifecycleShardPayload(shard),
      );
    }
    if (shard instanceof NodeLifecycleReceipt) {
      return this._encodePayload(NODE_LIFECYCLE_RECEIPT_PATH, nodeLifecycleReceiptPayload(shard));
    }
    if (shard instanceof ReceiptShard) {
      return this._encodePayload(
        'receipt.cbor',
        {
          version: shard.version,
          nodeCount: shard.nodeCount,
          labelCount: shard.labelCount,
          shardCount: shard.shardCount,
        },
      );
    }
    throw new WarpError('Unknown IndexShard type', 'E_UNKNOWN_SHARD');
  }

  private _encodePayload(path: string, payload: unknown): [string, Uint8Array] {
    const bytes = this._codec.encode(payload);
    if (this._structureLimits !== undefined) {
      validateBoundedCbor(bytes, this._structureLimits);
    }
    return [path, bytes];
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

/**
 * The receipt payload. A receipt is written only under the schema that this
 * runtime writes. A receipt of an earlier schema can be decoded, but writing
 * it would mark a root whose shards carry schema-3 records as schema 2.
 */
function nodeLifecycleReceiptPayload(receipt: NodeLifecycleReceipt): {
  readonly schemaVersion: number;
  readonly nodeCount: number;
  readonly shardCount: number;
  readonly floatingTombstones: readonly string[];
} {
  if (receipt.schemaVersion !== NODE_LIFECYCLE_SHARD_SCHEMA_VERSION) {
    throw new WarpError(
      `Unsupported node lifecycle receipt schema version for writing: ${String(receipt.schemaVersion)}`,
      'E_INDEX_SHARD_SCHEMA',
      { context: { schemaVersion: receipt.schemaVersion } },
    );
  }
  return {
    schemaVersion: receipt.schemaVersion,
    nodeCount: receipt.nodeCount,
    shardCount: receipt.shardCount,
    floatingTombstones: receipt.floatingTombstones,
  };
}

/** Orders the keys of one property bag; keys are unique, so two never compare equal. */
function compareStrings(left: string, right: string): number {
  return left < right ? -1 : 1;
}
