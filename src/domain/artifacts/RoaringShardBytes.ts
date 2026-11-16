import RoaringShardRejectedError from '../errors/RoaringShardRejectedError.ts';
import type CodecValue from '../types/codec/CodecValue.ts';

/**
 * Returns a decoded index value when it is serialized bitmap bytes.
 *
 * Every writer stores the bytes that the bitmap library serializes, and the
 * codec returns a stored byte string as a `Uint8Array`. Any other decoded
 * shape comes from a peer or from damaged storage. It is refused here,
 * before any step can read a length that the value declares.
 */
export default function requireRoaringShardBytes(value: CodecValue): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  throw RoaringShardRejectedError.malformed('not-bytes');
}
