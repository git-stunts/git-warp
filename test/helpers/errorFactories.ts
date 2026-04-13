/**
 * Shared error factories for test fixtures.
 *
 * Eliminates 318 raw `new Error()` usages across 90 test files.
 * Every test error should use a domain error type or these factories.
 */
import PersistenceError from '../../src/domain/errors/PersistenceError.ts';
import SyncError from '../../src/domain/errors/SyncError.ts';
import WarpError from '../../src/domain/errors/WarpError.ts';

// ---------------------------------------------------------------------------
// Git plumbing errors (for adapter tests)
// ---------------------------------------------------------------------------

export interface GitErrorOptions {
  exitCode?: number;
  stderr?: string;
  stdout?: string;
}

/** Creates a mock Git plumbing error with optional exit code and stderr. */
export function gitError(message: string, options: GitErrorOptions = {}): PersistenceError & { details?: { stderr?: string; stdout?: string; code?: number }; exitCode?: number } {
  const err = new PersistenceError(message, PersistenceError.E_MISSING_OBJECT) as PersistenceError & {
    details?: { stderr?: string; stdout?: string; code?: number };
    exitCode?: number;
  };
  if (options.exitCode !== undefined || options.stderr !== undefined || options.stdout !== undefined) {
    err.details = {
      ...(options.stderr !== undefined ? { stderr: options.stderr } : {}),
      ...(options.stdout !== undefined ? { stdout: options.stdout } : {}),
      ...(options.exitCode !== undefined ? { code: options.exitCode } : {}),
    };
    if (options.exitCode !== undefined) {
      err.exitCode = options.exitCode;
    }
  }
  return err;
}

// ---------------------------------------------------------------------------
// Domain errors for common test scenarios
// ---------------------------------------------------------------------------

/** Creates a persistence error for "ref not found" scenarios. */
export function refNotFoundError(ref: string): PersistenceError {
  return new PersistenceError(`Ref not found: ${ref}`, PersistenceError.E_REF_NOT_FOUND);
}

/** Creates a persistence error for "missing object" scenarios. */
export function missingObjectError(oid: string): PersistenceError {
  return new PersistenceError(`Missing Git object: ${oid}`, PersistenceError.E_MISSING_OBJECT);
}

/** Creates a sync error for network/timeout test scenarios. */
export function syncNetworkError(message = 'Network error'): SyncError {
  return new SyncError(message, { code: 'E_SYNC_NETWORK' });
}

/** Creates a sync error for timeout test scenarios. */
export function syncTimeoutError(timeoutMs = 10000): SyncError {
  return new SyncError('Sync request timed out', { code: 'E_SYNC_TIMEOUT', context: { timeoutMs } });
}

/** Creates a generic domain error for test scenarios. */
export function domainError(message: string, code = 'E_TEST'): WarpError {
  return new WarpError(message, code);
}
