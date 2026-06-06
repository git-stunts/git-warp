import MemoryBudgetError from '../../errors/MemoryBudgetError.ts';
import WarpMemoryPool from '../../memory/WarpMemoryPool.ts';
import BoundedQueryReadModel from './BoundedQueryReadModel.ts';
import BoundedQueryNodePage from './BoundedQueryNodePage.ts';
import type { QueryNodeStreamRequest, QueryReadModel } from './QueryReadModelProvider.ts';
import type { QueryNodeSnapshot } from './QueryPlan.ts';

export type BoundedQueryNodePageReaderFields = {
  readonly readModel: QueryReadModel;
  readonly pool: WarpMemoryPool;
};

export type BoundedQueryNodePageRequest = QueryNodeStreamRequest & {
  readonly limit: number;
  readonly cursor?: string | null;
};

/** Cursorized bounded reader for QueryReadModel node streams. */
export default class BoundedQueryNodePageReader {
  private readonly _readModel: QueryReadModel;
  private readonly _pool: WarpMemoryPool;

  constructor(fields: BoundedQueryNodePageReaderFields) {
    this._readModel = fields.readModel;
    this._pool = requireWarpMemoryPool(fields.pool);
    Object.freeze(this);
  }

  async readPage(request: BoundedQueryNodePageRequest): Promise<BoundedQueryNodePage> {
    const limit = requirePositiveInteger(request.limit, 'limit');
    const start = cursorOffset(request.cursor ?? null);
    const bounded = new BoundedQueryReadModel({
      source: this._readModel,
      pool: this._pool,
    });
    return await collectPage(bounded.nodes(request), start, limit);
  }
}

async function collectPage(
  nodes: AsyncIterable<QueryNodeSnapshot>,
  start: number,
  limit: number,
): Promise<BoundedQueryNodePage> {
  const pageNodes: QueryNodeSnapshot[] = [];
  let index = 0;
  let cursor: string | null = null;
  for await (const node of nodes) {
    if (index < start) {
      index += 1;
      continue;
    }
    if (pageNodes.length >= limit) {
      cursor = index.toString();
      break;
    }
    pageNodes.push(node);
    index += 1;
  }
  return new BoundedQueryNodePage({ nodes: pageNodes, cursor });
}

function cursorOffset(cursor: string | null): number {
  if (cursor === null) {
    return 0;
  }
  const parsed = Number.parseInt(cursor, 10);
  if (Number.isInteger(parsed) && parsed >= 0 && parsed.toString() === cursor) {
    return parsed;
  }
  throw new MemoryBudgetError('Bounded query node page cursor must be a non-negative integer string', {
    code: 'E_BOUNDED_QUERY_PAGE_INVALID',
    context: { field: 'cursor', value: cursor },
  });
}

function requirePositiveInteger(value: number, field: string): number {
  if (Number.isInteger(value) && value > 0) {
    return value;
  }
  throw new MemoryBudgetError('Bounded query node page limit must be a positive integer', {
    code: 'E_BOUNDED_QUERY_PAGE_INVALID',
    context: { field, value },
  });
}

function requireWarpMemoryPool(value: WarpMemoryPool): WarpMemoryPool {
  if (value instanceof WarpMemoryPool) {
    return value;
  }
  throw new MemoryBudgetError('BoundedQueryNodePageReader requires a WarpMemoryPool', {
    code: 'E_MEMORY_BUDGET_INVALID',
    context: { field: 'pool' },
  });
}
