/**
 * Cancellation utilities for async operations.
 *
 * @module domain/utils/cancellation
 */

import OperationAbortedError from '../errors/OperationAbortedError.js';

/**
 * Checks if an abort signal has been aborted and throws if so.
 *
 * @param {AbortSignal} [signal] - The abort signal to check
 * @param {string} [operation] - Name of the operation being checked
 * @throws {OperationAbortedError} If signal is aborted
 */
export function checkAborted(signal, operation) {
  if (signal?.aborted) {
    throw new OperationAbortedError(
      operation ? `Operation "${operation}" was aborted` : 'Operation was aborted',
      { context: { operation } }
    );
  }
}

/**
 * Creates an AbortSignal that will abort after the specified timeout.
 *
 * @param {number} ms - Timeout in milliseconds
 * @returns {AbortSignal} The abort signal
 */
export function createTimeoutSignal(ms) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
