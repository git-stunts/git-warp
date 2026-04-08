/**
 * Error narrowing utilities for catch clauses.
 *
 * TypeScript catch variables are `unknown`. These helpers provide
 * type-safe narrowing without wildcard casts.
 *
 * @module domain/types/WarpErrors
 */

/**
 * Narrows an unknown value to an Error instance.
 */
export function isError(err: unknown): err is Error {
  return err instanceof Error;
}

/**
 * Checks if an unknown value has a string `code` property.
 */
export function hasErrorCode(err: unknown): err is { code: string; message?: string; name?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as Record<string, unknown>)['code'] === 'string'
  );
}

/**
 * Narrows an unknown value to an object with a string `message` property.
 */
export function hasMessage(err: unknown): err is { message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as Record<string, unknown>)['message'] === 'string'
  );
}
