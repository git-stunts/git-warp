/**
 * traversalHelpers — module-level boundary validators and normalizers
 * used by LogicalTraversal.
 *
 * @module domain/services/query/traversalHelpers
 */

import TraversalError from '../../errors/TraversalError.ts';
import type { Direction } from '../../../ports/NeighborProviderPort.ts';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Strips `undefined` from every property value type in T. */
export type WithoutUndefined<T> = {
  [K in keyof T]: Exclude<T[K], undefined>;
};

/**
 * Strips keys whose value is `undefined` from an object so that
 * `exactOptionalPropertyTypes` doesn't complain about explicit `undefined`
 * being assigned to optional-but-not-undefined-typed properties.
 *
 * The return type is `WithoutUndefined<T>` so that properties whose values
 * were `T | undefined` become `T`, making the object assignable to params
 * typed with strict optional properties.
 */
export function stripUndefined<T extends Record<string, unknown>>( // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  obj: T,
): WithoutUndefined<T> {
  const out: Record<string, unknown> = {}; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  for (const key of Object.keys(obj)) {
    if (obj[key] !== undefined) {
      out[key] = obj[key];
    }
  }
  return out as WithoutUndefined<T>;
}

/**
 * Validates and normalizes an edge direction parameter.
 *
 * @throws {TraversalError} code 'INVALID_DIRECTION' if not a valid direction
 */
export function assertDirection(direction: string | undefined): Direction {
  if (direction === undefined) {
    return 'out';
  }
  if (direction === 'out' || direction === 'in' || direction === 'both') {
    return direction;
  }
  throw new TraversalError(`Invalid direction: ${direction}`, {
    code: 'INVALID_DIRECTION',
    context: { direction },
  });
}

/**
 * Normalizes a label filter into a Set for efficient lookup.
 *
 * Accepts a single label string, an array of labels, or undefined. Returns
 * a Set containing the label(s) or undefined if no filter is specified.
 *
 * @throws {TraversalError} code 'INVALID_LABEL_FILTER' if type is not string, array, or undefined
 */
export function normalizeLabelFilter(
  labelFilter: string | string[] | undefined,
): Set<string> | undefined {
  if (labelFilter === undefined) {
    return undefined;
  }
  if (Array.isArray(labelFilter)) {
    return new Set(labelFilter);
  }
  if (typeof labelFilter === 'string') {
    return new Set([labelFilter]);
  }
  throw new TraversalError('labelFilter must be a string or array', {
    code: 'INVALID_LABEL_FILTER',
    context: { receivedType: typeof labelFilter },
  });
}
