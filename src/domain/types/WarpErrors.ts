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
