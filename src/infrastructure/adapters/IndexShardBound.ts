import IndexError from '../../domain/errors/IndexError.ts';
import { INDEX_SHARD_LIMITS } from '../../domain/materialization/IndexShardLimits.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type { CodecDecodeBound } from '../../ports/CodecPort.ts';
import type CodecValue from '../../domain/types/codec/CodecValue.ts';
import { validateBoundedCbor, type CborStructureLimits } from './BoundedCborValidation.ts';

/**
 * The index-shard bound (#1159) as the CBOR index adapters apply it. Each
 * adapter that writes or reads an index shard file refuses one above the
 * shared `INDEX_SHARD_LIMITS` the same way: `E_INDEX_SHARD_TOO_LARGE` above
 * its byte limit, and `E_INDEX_SHARD_MALFORMED` above its structure limits.
 * (The domain readers that call `CodecPort.decodeWithin` directly refuse at
 * the same bound with `E_CBOR_DECODE_BOUNDS`.) A caller may ask for a
 * tighter bound, never a wider one.
 */
export function indexShardBoundWithin(options: Readonly<{
  maxBytes?: number | undefined;
  structureLimits?: CborStructureLimits | undefined;
}>): CodecDecodeBound {
  return Object.freeze({
    maxBytes: Math.min(options.maxBytes ?? INDEX_SHARD_LIMITS.maxBytes, INDEX_SHARD_LIMITS.maxBytes),
    structureLimits: tighterStructureLimits(options.structureLimits ?? INDEX_SHARD_LIMITS.structureLimits),
  });
}

/** Refuses an encoded index shard above `maximum` bytes. */
export function requireIndexShardBytes(path: string, actual: number, maximum: number): void {
  if (actual > maximum) {
    throw indexShardTooLarge(actual, maximum, path);
  }
}

/**
 * The refusal of an index shard above its byte limit. `path` is null where
 * a stream has no member path; `actual` is null where the storage refused
 * the bytes without reporting their length.
 */
export function indexShardTooLarge(actual: number | null, maximum: number, path: string | null = null): IndexError {
  return new IndexError('Index shard exceeds the configured maximum', {
    code: 'E_INDEX_SHARD_TOO_LARGE',
    context: path === null ? { actual, maximum } : { path, actual, maximum },
  });
}

/**
 * Decodes one encoded index shard under `bound`: the byte limit and the
 * structure limits are checked with the index-shard refusals before the
 * codec reads the bytes.
 */
export function decodeIndexShard<TDecoded extends CodecValue = CodecValue>(
  codec: CodecPort,
  encoded: Readonly<{ path: string; bytes: Uint8Array }>,
  bound: CodecDecodeBound,
): TDecoded {
  requireIndexShardBytes(encoded.path, encoded.bytes.byteLength, bound.maxBytes);
  validateBoundedCbor(encoded.bytes, bound.structureLimits);
  return codec.decodeWithin<TDecoded>(encoded.bytes, bound);
}

function tighterStructureLimits(requested: CborStructureLimits): CborStructureLimits {
  const shared = INDEX_SHARD_LIMITS.structureLimits;
  return Object.freeze({
    maxContainerEntries: Math.min(requested.maxContainerEntries, shared.maxContainerEntries),
    maxDepth: Math.min(requested.maxDepth, shared.maxDepth),
    maxItems: Math.min(requested.maxItems, shared.maxItems),
  });
}
