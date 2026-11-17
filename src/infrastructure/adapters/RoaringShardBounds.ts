import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';

/**
 * The most values that the alive bitmap of one meta shard can hold. An
 * alive bitmap holds global ids of its own meta shard only, and a global id
 * carries a 24-bit local id. Writers allocate local ids below 2^24
 * (`ShardIdOverflowError`), so no writer stores an alive bitmap above it.
 */
const MAX_ALIVE_CARDINALITY = 2 ** 24;
/**
 * The size of the global id space. An edge bitmap holds the global ids of
 * the neighbours of one node in one bucket, and neighbours come from all 256
 * meta shards. A writer can therefore store any number of values up to this
 * one, and the boundary refuses no edge bitmap for its cardinality.
 */
const ID_SPACE = 2 ** 32;
const PORTABLE_PREFIX_BYTES = 8;
const RUN_FLAG_BYTES = 65536 / 8;
const CONTAINER_METADATA_BYTES = 65536 * 8;
const BYTES_PER_VALUE = 2;

/**
 * The byte bound for one bitmap of either kind. It is an upper bound on the
 * portable encoding of MAX_ALIVE_CARDINALITY values; no real encoding
 * attains it, because its terms do not all occur together. A container
 * body never uses more than two bytes for each value: an array stores two
 * bytes for each value, a bitmap container (8192 bytes) holds more than
 * 4096 values, and a run container is kept only when it is smaller. Each of
 * the 65536 possible containers adds a key, a cardinality and an offset (8
 * bytes), and the run-flag bitmap adds 8192 bytes at most. The bound is
 * above every index shard file that the codecs read (5 MiB with the default
 * codec), so on those paths the codec refuses a larger file first.
 */
const MAX_BYTES = PORTABLE_PREFIX_BYTES + RUN_FLAG_BYTES + CONTAINER_METADATA_BYTES
  + BYTES_PER_VALUE * MAX_ALIVE_CARDINALITY;

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AdapterValidationError(`Roaring shard bound ${name} must be a positive safe integer`);
  }
  return value;
}

/**
 * The declared resource bounds for one serialized Roaring bitmap shard.
 *
 * An alive bitmap is bounded in bytes and in cardinality. An edge bitmap is
 * bounded in bytes and by structure validation only. Measured payloads are
 * far below the byte bound. In a 1M-node graph with 5 edges per node, the
 * largest shard holds 4,278 values in 8,208 bytes. When one hub node links
 * to every other node, its shard holds 999,999 values in 1,992,642 bytes.
 */
export default class RoaringShardBounds {
  static readonly MAX_ALIVE_CARDINALITY = MAX_ALIVE_CARDINALITY;
  static readonly MAX_BYTES = MAX_BYTES;

  readonly maxBytes: number;
  readonly maxCardinality: number;

  constructor(options: { readonly maxBytes: number; readonly maxCardinality: number }) {
    this.maxBytes = requirePositiveInteger(options.maxBytes, 'maxBytes');
    this.maxCardinality = requirePositiveInteger(options.maxCardinality, 'maxCardinality');
    Object.freeze(this);
  }

  static readonly #ALIVE = new RoaringShardBounds({ maxBytes: MAX_BYTES, maxCardinality: MAX_ALIVE_CARDINALITY });
  static readonly #EDGE = new RoaringShardBounds({ maxBytes: MAX_BYTES, maxCardinality: ID_SPACE });

  /** The bounds for the alive bitmap of one meta shard. */
  static alive(): RoaringShardBounds {
    return RoaringShardBounds.#ALIVE;
  }

  /** The bounds for an edge bitmap: no cardinality below the id space is refused. */
  static edge(): RoaringShardBounds {
    return RoaringShardBounds.#EDGE;
  }
}
