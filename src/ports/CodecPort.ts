import type CodecValue from '../domain/types/codec/CodecValue.ts';

/**
 * CodecPort — structured-codec contract for byte codecs (CBOR,
 * MessagePack, binary JSON, etc.).
 *
 * `encode` and `decode` carry method-level type parameters so callers
 * name the shape they are putting in or pulling out. Defaults fall
 * back to the shared `CodecValue` transport union — the named set of
 * values a structured codec can round-trip — so polymorphic call
 * sites have a concrete named type.
 *
 * Per `docs/ANTI_SLUDGE_POLICY.md`, a decoder that returns a shrug
 * type is not a contract. This port's return type is always a
 * named type, even when the caller does not narrow further.
 *
 * Adapters implementing this port live in
 * `src/infrastructure/adapters/**` and in `src/infrastructure/codecs/**`.
 * Method-level generics let an adapter's internals keep raw-bytes
 * handling untyped (adapter privilege) while the port surface
 * remains runtime-honest.
 *
 * @module ports/CodecPort
 */

/**
 * The most that one decode may read: the encoded bytes, and the nesting
 * depth, item count and container entry count of the encoded value.
 */
export type CodecDecodeBound = Readonly<{
  maxBytes: number;
  structureLimits: Readonly<{
    maxContainerEntries: number;
    maxDepth: number;
    maxItems: number;
  }>;
}>;

/** Parameterized structured-codec port. */
export default abstract class CodecPort {
  /** Encodes a typed value into bytes. */
  abstract encode<TEncoded = CodecValue>(_data: TEncoded): Uint8Array;

  /** Decodes bytes into a typed value, under the codec's default decode bound. */
  abstract decode<TDecoded = CodecValue>(_bytes: Uint8Array): TDecoded;

  /**
   * Decodes bytes into a typed value under `bound`, in place of the
   * codec's default decode bound. An artifact family whose writers admit
   * more than the default (index shards, #1159) is read with its own bound.
   */
  abstract decodeWithin<TDecoded = CodecValue>(_bytes: Uint8Array, _bound: CodecDecodeBound): TDecoded;
}
