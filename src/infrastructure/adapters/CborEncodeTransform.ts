import Transform from '../../domain/stream/Transform.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import WarpError from '../../domain/errors/WarpError.ts';

/**
 * Stream transform that CBOR-encodes the value component of [path, data] entries.
 *
 * Input:  `[string, unknown]` — path + domain object
 * Output: `[string, Uint8Array]` — path + CBOR bytes
 */
export class CborEncodeTransform extends Transform<[string, unknown], [string, Uint8Array]> {
  private readonly _codec: CodecPort;

  constructor(codec: CodecPort) {
    super();
    if (codec === null || codec === undefined) {
      throw new WarpError('CborEncodeTransform requires a codec', 'E_INVALID_DEPENDENCY');
    }
    this._codec = codec;
  }

  override async *apply(source: AsyncIterable<[string, unknown]>): AsyncIterable<[string, Uint8Array]> {
    for await (const [path, data] of source) {
      yield [path, this._codec.encode(data)];
    }
  }
}
