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
    this.nodes = freezeNodes(fields.nodes);
    this.cursor = normalizeCursor(fields.cursor);
    Object.freeze(this);
  }
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
