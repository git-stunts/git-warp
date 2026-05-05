/**
 * Error narrowing utilities for catch clauses.
 *
 * TypeScript catch variables are `unknown`. These helpers provide // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
 * type-safe narrowing without wildcard casts.
 *
 * @module domain/types/WarpErrors
 */

/**
 * Narrows an unknown value to an Error instance. // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
 */
export function isError(err: unknown): err is Error {
  return err instanceof Error;
}

/**
 * Checks if an unknown value has a string `code` property. // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
 */
export function hasErrorCode(err: unknown): err is { code: string; message?: string; name?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as Record<string, unknown>)['code'] === 'string' // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  );
}

/**
 * Narrows an unknown value to an object with a string `message` property. // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
 */
export function hasMessage(err: unknown): err is { message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as Record<string, unknown>)['message'] === 'string' // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  );
}
