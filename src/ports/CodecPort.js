/**
 * Port for serialization/deserialization operations.
 *
 * Abstracts codec implementations to allow substitution of
 * CBOR, JSON, MessagePack, or other formats.
 */
export default class CodecPort {
  /**
   * Encodes data to binary format.
   * @param {unknown} _data - Data to encode
   * @returns {Uint8Array} Encoded bytes
   */
  encode(_data) {
    throw new Error('CodecPort.encode() not implemented');
  }

  /**
   * Decodes binary data back to a JavaScript value.
   * @param {Uint8Array} _bytes - Encoded bytes to decode
   * @returns {unknown} Decoded value
   */
  decode(_bytes) {
    throw new Error('CodecPort.decode() not implemented');
  }
}
