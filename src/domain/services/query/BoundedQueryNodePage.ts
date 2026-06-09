import MemoryBudgetError from '../../errors/MemoryBudgetError.ts';
import type { QueryNodeSnapshot } from './QueryPlan.ts';

export type BoundedQueryNodePageFields = {
  readonly nodes: readonly QueryNodeSnapshot[];
  readonly cursor: string | null;
};

/** Immutable bounded page of query node snapshots. */
export default class BoundedQueryNodePage {
  readonly nodes: readonly QueryNodeSnapshot[];
  readonly cursor: string | null;

  constructor(fields: BoundedQueryNodePageFields) {
    const validFields = requirePageFields(fields);
    this.nodes = freezeNodes(validFields.nodes);
    this.cursor = normalizeCursor(validFields.cursor);
    Object.freeze(this);
  }
}

function requirePageFields(
  fields: BoundedQueryNodePageFields | null | undefined,
): BoundedQueryNodePageFields {
  if (fields !== null && typeof fields === 'object') {
    return fields;
  }
  throw new MemoryBudgetError('Bounded query node page requires object fields', {
    code: 'E_BOUNDED_QUERY_PAGE_INVALID',
    context: { field: 'fields' },
  });
}

function freezeNodes(values: readonly QueryNodeSnapshot[]): readonly QueryNodeSnapshot[] {
  if (!Array.isArray(values)) {
    throw new MemoryBudgetError('Bounded query node page requires an array of nodes', {
      code: 'E_BOUNDED_QUERY_PAGE_INVALID',
      context: { field: 'nodes' },
    });
  }
  const nodes: QueryNodeSnapshot[] = [];
  for (const value of values) {
    nodes.push(value);
  }
  return Object.freeze(nodes);
}

function normalizeCursor(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  throw new MemoryBudgetError('Bounded query node page cursor must be non-empty or null', {
    code: 'E_BOUNDED_QUERY_PAGE_INVALID',
    context: { field: 'cursor' },
  });
}
