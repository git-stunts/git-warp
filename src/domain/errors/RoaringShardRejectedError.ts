import WarpError from './WarpError.ts';

/**
 * A serialized Roaring bitmap shard failed boundary validation.
 *
 * Shards come from peers and from retained storage, so they are untrusted.
 * The boundary raises this error before the bitmap library reads the bytes.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_ROARING_SHARD_MALFORMED` | The bytes are not a valid portable Roaring encoding; `context.fault` names the defect |
 * | `E_ROARING_SHARD_TOO_LARGE` | The shard has more bytes than the declared bound |
 * | `E_ROARING_SHARD_CARDINALITY` | The container headers declare more values than the declared bound |
 * | `E_ROARING_SHARD_FORMAT` | A caller asked for a serialization format that the boundary does not validate |
 */
export default class RoaringShardRejectedError extends WarpError {
  private constructor(message: string, code: string, context: Record<string, string | number>) {
    super(message, code, { context });
    Object.freeze(this);
  }

  static malformed(fault: string): RoaringShardRejectedError {
    return new RoaringShardRejectedError(
      `Roaring shard is malformed: ${fault}`,
      'E_ROARING_SHARD_MALFORMED',
      { fault },
    );
  }

  static tooLarge(byteLength: number, maxBytes: number): RoaringShardRejectedError {
    return new RoaringShardRejectedError(
      `Roaring shard has ${byteLength} bytes; the bound is ${maxBytes}`,
      'E_ROARING_SHARD_TOO_LARGE',
      { byteLength, maxBytes },
    );
  }

  static cardinalityExceeded(cardinality: number, maxCardinality: number): RoaringShardRejectedError {
    return new RoaringShardRejectedError(
      `Roaring shard declares ${cardinality} values; the bound is ${maxCardinality}`,
      'E_ROARING_SHARD_CARDINALITY',
      { cardinality, maxCardinality },
    );
  }

  static unsupportedFormat(): RoaringShardRejectedError {
    return new RoaringShardRejectedError(
      'Roaring shards are read only in the portable format',
      'E_ROARING_SHARD_FORMAT',
      {},
    );
  }
}
