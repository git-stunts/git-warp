import WarpError, { type WarpErrorOptions } from "./WarpError.ts";

/**
 * Error class for LRU page-cache contract violations.
 *
 * Raised when cache construction or mutation receives invalid input
 * or when a cached page violates the cursor's structural
 * expectations.
 */
export default class PageCacheError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, "E_PAGE_CACHE_INPUT", options);
  }
}
