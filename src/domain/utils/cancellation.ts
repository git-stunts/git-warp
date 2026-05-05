/**
 * Cancellation utilities for async operations.
 *
 * @module domain/utils/cancellation
 */

import OperationAbortedError from '../errors/OperationAbortedError.ts';

/**
 * Resolves an optional operation name to a non-empty string.
 */
function resolveOperationName(operation?: string): string {
  return typeof operation === 'string' && operation.length > 0 ? operation : 'unknown'; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
}

/**
 * Checks if an abort signal has been aborted and throws if so.
 *
 * @throws {OperationAbortedError} If signal is aborted
 */
export function checkAborted(signal?: AbortSignal, operation?: string): void {
  if (signal !== null && signal !== undefined && signal.aborted) {
    const opName = resolveOperationName(operation);
    throw new OperationAbortedError(opName, { context: { operation: opName } });
  }
}

/**
 * Creates an AbortSignal that will abort after the specified timeout.
 *
 * Note: This signal cannot be manually cancelled. If callers need early
 * cancellation, they should use AbortController directly.
 */
export function createTimeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}
