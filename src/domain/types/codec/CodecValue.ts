/**
 * CodecValue — the union of values that a structured codec can round-
 * trip through a `CodecPort<T>` without data loss.
 *
 * Structured codecs (CBOR, MessagePack, JSON with binary extensions)
 * share a common data model: primitives, byte arrays, dates, arrays,
 * and records of this same union. `CodecValue` names that model so
 * port signatures can speak about "the set of things this codec can
 * carry" with a concrete type.
 *
 * This is a transport DTO — pure data with no invariants, no
 * behavior, no identity. SSTS P1 says classes are for concepts that
 * have invariants. A codec-compatible value has none; it is a
 * structural union. Hence `type`, not `class`.
 *
 * ### Constructors on the type union
 *
 * The recursive case `{ readonly [key: string]: CodecValue }`
 * admits plain records — including domain class instances whose
 * public shape resolves to primitives, arrays, and nested records.
 * The codec adapter (e.g. `CborCodec`) walks the value at runtime;
 * its encoding rules are the runtime contract, and `CodecValue` is
 * the static documentation of that contract.
 *
 * ### What `CodecValue` does NOT promise
 *
 * - It is not a validated type. A value that satisfies `CodecValue`
 *   statically may still fail to encode at runtime if the codec has
 *   stricter rules (e.g. CBOR rejects symbols). Callers that care
 *   about the guarantee rely on the specific adapter's own error
 *   reporting.
 * - It is not a claim about decoded shape. The decoder returns
 *   `CodecValue` by default; callers that expect a specific domain
 *   type specialize `CodecPort<TDecoded>` to that type.
 *
 * @module domain/types/codec/CodecValue
 */

/**
 * A value that a structured codec (CBOR / MessagePack / binary JSON)
 * can round-trip. Recursive: arrays and records of `CodecValue` are
 * themselves `CodecValue`.
 */
export type CodecValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | bigint
  | Uint8Array
  | Date
  | ReadonlyArray<CodecValue>
  | { readonly [key: string]: CodecValue };

export default CodecValue;
