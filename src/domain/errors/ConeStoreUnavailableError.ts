import WarpError from './WarpError.ts';

/**
 * The cone record store could not be reached (#1079): the host or Git plumbing
 * beneath it failed. It is not corruption and not a defect, so the operation may
 * succeed if tried again. Only the cone store adapter throws it, with the host
 * failure as its `cause`.
 */
export default class ConeStoreUnavailableError extends WarpError {
  declare cause: Error;

  constructor(operation: string, cause: Error) {
    super(`The cone record store could not ${operation}: ${cause.message}`, 'E_CONE_STORE_UNAVAILABLE', { context: { operation } });
    this.cause = cause;
  }
}
