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

/** Parameterized structured-codec port. */
export default abstract class CodecPort {
  /** Encodes a typed value into bytes. */
  abstract encode<TEncoded = CodecValue>(_data: TEncoded): Uint8Array;

  /** Decodes bytes into a typed value. */
  abstract decode<TDecoded = CodecValue>(_bytes: Uint8Array): TDecoded;
}
