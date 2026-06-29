import WarpError from '../../errors/WarpError.ts';
import type CodecPort from '../../../ports/CodecPort.ts';

export function requireCodec(
  codec: CodecPort | null | undefined,
  context: string,
): CodecPort {
  if (codec === null || codec === undefined) {
    throw new WarpError(`${context} requires an injected CodecPort`, 'E_CODEC_REQUIRED');
  }
  return codec;
}
