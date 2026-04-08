import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/** Error class for invalid WARP message trailers and codec metadata. */
export default class MessageCodecError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, 'MESSAGE_CODEC_ERROR', options);
  }
}
