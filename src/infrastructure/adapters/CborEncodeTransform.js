import Transform from '../../domain/stream/Transform.js';
import WarpError from '../../domain/errors/WarpError.ts';

/**
 * Stream transform that CBOR-encodes the value component of [path, data] entries.
 *
 * Input:  `[string, unknown]` — path + domain object
 * Output: `[string, Uint8Array]` — path + CBOR bytes
 *
 * @extends {Transform<[string, unknown], [string, Uint8Array]>}
 */
export class CborEncodeTransform extends Transform {
  /**
   * Creates a CborEncodeTransform.
   *
   * @param {import('../../ports/CodecPort.js').default} codec
   */
  constructor(codec) {
    super();
    if (codec === null || codec === undefined) {
      throw new WarpError('CborEncodeTransform requires a codec', 'E_INVALID_DEPENDENCY');
    }
    /** @type {import('../../ports/CodecPort.js').default} */
    this._codec = codec;
  }

  /**
   * Encodes each [path, data] entry to [path, bytes].
   *
   * @param {AsyncIterable<[string, unknown]>} source
   * @returns {AsyncIterable<[string, Uint8Array]>}
   */
  async *apply(source) {
    for await (const [path, data] of source) {
      yield [path, this._codec.encode(data)];
    }
  }
}
