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
 * @param {unknown} err
 * @returns {err is Error}
 */
export function isError(err) {
  return err instanceof Error;
}

/**
 * Checks if an unknown value has a string `code` property.
 * @param {unknown} err
 * @returns {err is {code: string, message?: string, name?: string}}
 */
export function hasErrorCode(err) {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    // eslint-disable-next-line @typescript-eslint/dot-notation -- Record<string,unknown> requires bracket access (TS4111)
    typeof (/** @type {Record<string, unknown>} */ (err))['code'] === 'string'
  );
}

/**
 * Narrows an unknown value to an object with a string `message` property.
 * @param {unknown} err
 * @returns {err is {message: string}}
 */
export function hasMessage(err) {
  return (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    // eslint-disable-next-line @typescript-eslint/dot-notation -- Record<string,unknown> requires bracket access (TS4111)
    typeof (/** @type {Record<string, unknown>} */ (err))['message'] === 'string'
  );
}
