import Transform from '../../domain/stream/Transform.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import WarpError from '../../domain/errors/WarpError.ts';

/**
 * Stream transform that CBOR-decodes the value component of [path, bytes] entries.
 *
 * Input:  `[string, Uint8Array]` — path + CBOR bytes
 * Output: `[string, unknown]` — path + decoded domain object
 */
export class CborDecodeTransform extends Transform<[string, Uint8Array], [string, unknown]> {
  private readonly _codec: CodecPort;

  constructor(codec: CodecPort) {
    super();
    if (codec === null || codec === undefined) {
      throw new WarpError('CborDecodeTransform requires a codec', 'E_INVALID_DEPENDENCY');
    }
    this._codec = codec;
  }

  override async *apply(source: AsyncIterable<[string, Uint8Array]>): AsyncIterable<[string, unknown]> {
    for await (const [path, bytes] of source) {
      yield [path, this._codec.decode(bytes)];
    }
  }
}
