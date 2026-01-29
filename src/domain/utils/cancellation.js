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
    throw new OperationAbortedError(operation || 'unknown', { context: { operation } });
  }
}

/**
 * Creates an AbortSignal that will abort after the specified timeout.
 *
 * Note: This signal cannot be manually cancelled. If callers need early
 * cancellation, they should use AbortController directly.
 *
 * @param {number} ms - Timeout in milliseconds
 * @returns {AbortSignal} The abort signal
 */
export function createTimeoutSignal(ms) {
  return AbortSignal.timeout(ms);
}
