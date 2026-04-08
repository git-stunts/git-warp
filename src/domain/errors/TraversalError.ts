import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/** Error class for graph traversal operations. */
export default class TraversalError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, 'TRAVERSAL_ERROR', options);
  }
}
