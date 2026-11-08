import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';

/** Values one meta shard can address: global ids carry a 24-bit local id. */
const MAX_CARDINALITY = 2 ** 24;
const PORTABLE_PREFIX_BYTES = 8;
const RUN_FLAG_BYTES = 65536 / 8;
const CONTAINER_METADATA_BYTES = 65536 * 8;
const BYTES_PER_VALUE = 2;

/**
 * The largest portable encoding that CRoaring emits for MAX_CARDINALITY
 * values. A container body never uses more than two bytes for each value:
 * an array stores two bytes for each value, a bitmap container (8192 bytes)
 * holds more than 4096 values, and a run container is kept only when it is
 * smaller. Each of the 65536 possible containers adds a key, a cardinality
 * and an offset (8 bytes), and the run-flag bitmap adds 8192 bytes at most.
 */
const MAX_BYTES = PORTABLE_PREFIX_BYTES + RUN_FLAG_BYTES + CONTAINER_METADATA_BYTES
  + BYTES_PER_VALUE * MAX_CARDINALITY;

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AdapterValidationError(`Roaring shard bound ${name} must be a positive safe integer`);
  }
  return value;
}

/**
 * The declared resource bounds for one serialized Roaring bitmap shard.
 *
 * The standard bounds hold 2^24 values: the whole local-id space of one
 * meta shard. Measured payloads are far below them. In a 1M-node graph
 * with 5 edges per node, the largest shard holds 4,278 values in 8,208
 * bytes. When one hub node links to every other node, its shard holds
 * 999,999 values in 1,992,642 bytes: about 1/17 of each bound.
 */
export default class RoaringShardBounds {
  static readonly MAX_CARDINALITY = MAX_CARDINALITY;
  static readonly MAX_BYTES = MAX_BYTES;

  readonly maxBytes: number;
  readonly maxCardinality: number;

  constructor(options: { readonly maxBytes: number; readonly maxCardinality: number }) {
    this.maxBytes = requirePositiveInteger(options.maxBytes, 'maxBytes');
    this.maxCardinality = requirePositiveInteger(options.maxCardinality, 'maxCardinality');
    Object.freeze(this);
  }

  static readonly #STANDARD = new RoaringShardBounds({ maxBytes: MAX_BYTES, maxCardinality: MAX_CARDINALITY });

  static standard(): RoaringShardBounds {
    return RoaringShardBounds.#STANDARD;
  }
}
