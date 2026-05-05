import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/** Error class for aborted operations. */
export default class OperationAbortedError extends WarpError {
  readonly operation: string;
  readonly reason: string;

  constructor(operation: string, options: WarpErrorOptions & { reason?: string } = {}) {
    const reason = options.reason !== undefined && options.reason !== '' ? options.reason : 'Operation was aborted';
    super(`Operation '${operation}' aborted: ${reason}`, 'OPERATION_ABORTED', options);
    this.operation = operation;
    this.reason = reason;
  }
}
