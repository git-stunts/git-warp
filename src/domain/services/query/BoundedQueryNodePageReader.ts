import MemoryBudgetError from '../../errors/MemoryBudgetError.ts';
import type MemoryBudgetLease from '../../memory/MemoryBudgetLease.ts';
import WarpMemoryPool from '../../memory/WarpMemoryPool.ts';
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
    const validFields = requireReaderFields(fields);
    this._readModel = requireQueryReadModel(validFields.readModel);
    this._pool = requireWarpMemoryPool(validFields.pool);
    Object.freeze(this);
  }

  async readPage(request: BoundedQueryNodePageRequest): Promise<BoundedQueryNodePage> {
    const validRequest = requirePageRequest(request);
    const limit = requirePositiveInteger(validRequest.limit, 'limit');
    const start = cursorOffset(validRequest.cursor ?? null);
    return await collectPage({
      nodes: this._readModel.nodes(validRequest),
      pool: this._pool,
      start,
      limit,
    });
  }
}

type CollectPageOptions = {
  readonly nodes: AsyncIterable<QueryNodeSnapshot>;
  readonly pool: WarpMemoryPool;
  readonly start: number;
  readonly limit: number;
};

async function collectPage(options: CollectPageOptions): Promise<BoundedQueryNodePage> {
  const pageNodes: QueryNodeSnapshot[] = [];
  const leases: MemoryBudgetLease[] = [];
  let index = 0;
  let cursor: string | null = null;
  try {
    for await (const node of options.nodes) {
      if (index < options.start) {
        index += 1;
        continue;
      }
      if (pageNodes.length >= options.limit) {
        cursor = index.toString();
        break;
      }
      leases.push(options.pool.acquire({ scope: 'query.nodes.page', amount: 1 }));
      pageNodes.push(node);
      index += 1;
    }
    return new BoundedQueryNodePage({ nodes: pageNodes, cursor });
  } finally {
    for (const lease of leases) {
      lease.release();
    }
  }
}

function requireReaderFields(
  fields: BoundedQueryNodePageReaderFields | null | undefined,
): BoundedQueryNodePageReaderFields {
  if (fields !== null && typeof fields === 'object') {
    return fields;
  }
  throw new MemoryBudgetError('BoundedQueryNodePageReader requires object fields', {
    code: 'E_BOUNDED_QUERY_PAGE_INVALID',
    context: { field: 'fields' },
  });
}

function requireQueryReadModel(value: QueryReadModel): QueryReadModel {
  if (hasQueryReadModelShape(value)) {
    return value;
  }
  throw new MemoryBudgetError('BoundedQueryNodePageReader requires a QueryReadModel', {
    code: 'E_BOUNDED_QUERY_PAGE_INVALID',
    context: { field: 'readModel' },
  });
}

function hasQueryReadModelShape(value: QueryReadModel): boolean {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  return hasQueryReadModelMembers(value);
}

function hasQueryReadModelMembers(value: QueryReadModel): boolean {
  return typeof value.stateHash === 'string'
    && typeof value.nodes === 'function'
    && typeof value.neighbors === 'function'
    && typeof value.nodeProps === 'function';
}

function requirePageRequest(
  request: BoundedQueryNodePageRequest | null | undefined,
): BoundedQueryNodePageRequest {
  if (request !== null && typeof request === 'object') {
    return request;
  }
  throw new MemoryBudgetError('Bounded query node page request must be an object', {
    code: 'E_BOUNDED_QUERY_PAGE_INVALID',
    context: { field: 'request' },
  });
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
