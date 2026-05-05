import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/** Error class for cache configuration and lifecycle failures. */
export default class CacheError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, 'CACHE_ERROR', options);
  }
}
