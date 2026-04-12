/**
 * traversalHelpers — module-level boundary validators and normalizers
 * used by LogicalTraversal.
 *
 * @module domain/services/query/traversalHelpers
 */

import TraversalError from '../../errors/TraversalError.ts';
import ORSet from '../../crdt/ORSet.ts';
import type { Direction, NeighborEdge } from '../../../ports/NeighborProviderPort.ts';

// ── Types ──────────────────────────────────────────────────────────────────

/** Validated adjacency snapshot used by LogicalTraversal. */
export interface AdjacencyMaps {
  outgoing: Map<string, Array<{ neighborId: string; label: string }>>;
  incoming: Map<string, Array<{ neighborId: string; label: string }>>;
}

/** Validated traversal state used by LogicalTraversal. */
export interface TraversalState {
  nodeAlive: ORSet;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns true when a value is a materialized adjacency record.
 */
export function isAdjacencyMaps(adjacency: unknown): adjacency is AdjacencyMaps {
  return (
    adjacency !== null &&
    typeof adjacency === 'object' &&
    (adjacency as Record<string, unknown>)['outgoing'] instanceof Map &&
    (adjacency as Record<string, unknown>)['incoming'] instanceof Map
  );
}

/**
 * Validates the materialized adjacency boundary before traversal.
 *
 * @throws {TraversalError} code 'E_TRAVERSAL_ADJACENCY' if invalid
 */
export function requireAdjacencyMaps(adjacency: unknown): AdjacencyMaps {
  if (!isAdjacencyMaps(adjacency)) {
    throw new TraversalError('materialized traversal adjacency is invalid', {
      code: 'E_TRAVERSAL_ADJACENCY',
    });
  }
  return adjacency;
}

/**
 * Validates the materialized traversal state boundary before building the provider.
 *
 * @throws {TraversalError} code 'E_TRAVERSAL_STATE' if invalid
 */
export function requireTraversalState(state: unknown): TraversalState {
  if (
    state === null ||
    typeof state !== 'object' ||
    !((state as Record<string, unknown>)['nodeAlive'] instanceof ORSet)
  ) {
    throw new TraversalError('materialized traversal state is missing nodeAlive', {
      code: 'E_TRAVERSAL_STATE',
    });
  }
  return state as TraversalState;
}

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
export function stripUndefined<T extends Record<string, unknown>>(
  obj: T,
): WithoutUndefined<T> {
  const out: Record<string, unknown> = {};
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

// Re-export for convenience of callers that need the edge shape alongside AdjacencyMaps.
export type { NeighborEdge };
