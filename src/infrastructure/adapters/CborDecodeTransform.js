import Transform from '../../domain/stream/Transform.js';

/**
 * Stream transform that CBOR-decodes the value component of [path, bytes] entries.
 *
 * Input:  `[string, Uint8Array]` — path + CBOR bytes
 * Output: `[string, unknown]` — path + decoded domain object
 *
 * @extends {Transform<[string, Uint8Array], [string, unknown]>}
 */
export class CborDecodeTransform extends Transform {
  /**
   * Creates a CborDecodeTransform.
   *
   * @param {import('../../ports/CodecPort.js').default} codec
   */
  constructor(codec) {
    super();
    /** @type {import('../../ports/CodecPort.js').default} */
    this._codec = codec;
  }

  /**
   * Decodes each [path, bytes] entry to [path, data].
   *
   * @param {AsyncIterable<[string, Uint8Array]>} source
   * @returns {AsyncIterable<[string, unknown]>}
   */
  async *apply(source) {
    for await (const [path, bytes] of source) {
      yield [path, this._codec.decode(bytes)];
    }
  }
}
