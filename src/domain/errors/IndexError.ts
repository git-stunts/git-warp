import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/** Base error class for bitmap index operations. */
export default class IndexError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, 'INDEX_ERROR', options);
  }
}
