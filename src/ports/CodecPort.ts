/**
 * Port for serialization/deserialization operations.
 *
 * Abstracts codec implementations to allow substitution of
 * CBOR, JSON, MessagePack, or other formats.
 */

/** Port for serialization/deserialization operations. */
export default abstract class CodecPort {
  /** Encodes data to binary format. */
  abstract encode(_data: unknown): Uint8Array;

  /** Decodes binary data back to a JavaScript value. */
  abstract decode(_bytes: Uint8Array): unknown;
}
