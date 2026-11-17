import RoaringShardRejectedError from '../errors/RoaringShardRejectedError.ts';
import type CodecValue from '../types/codec/CodecValue.ts';

/** Serialized bitmap bytes, keyed by bucket and then by owner global id. */
export type EdgeShardBuckets = Record<string, Record<string, Uint8Array>>;

type DecodedMap = { readonly [key: string]: CodecValue };

function isDecodedMap(value: CodecValue): value is DecodedMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && !(value instanceof Uint8Array) && !(value instanceof Date);
}

function isBitmapBucket(bucket: CodecValue): bucket is Record<string, Uint8Array> {
  return isDecodedMap(bucket) && Object.values(bucket).every((value) => value instanceof Uint8Array);
}

function isEdgeShardBuckets(decoded: CodecValue): decoded is EdgeShardBuckets {
  return isDecodedMap(decoded) && Object.values(decoded).every(isBitmapBucket);
}

function holdsBuckets(decoded: CodecValue): boolean {
  return isDecodedMap(decoded) && Object.values(decoded).every(isDecodedMap);
}

/**
 * Returns a decoded edge shard when it is a map of buckets and every bucket
 * value is serialized bitmap bytes. The decoded object is returned as it
 * is; nothing is copied or expanded. Every other shape is refused, so
 * readers of the result never convert a value that a peer supplied.
 */
export default function requireEdgeShardBuckets(decoded: CodecValue): EdgeShardBuckets {
  if (isEdgeShardBuckets(decoded)) {
    return decoded;
  }
  throw RoaringShardRejectedError.malformed(holdsBuckets(decoded) ? 'not-bytes' : 'not-buckets');
}
