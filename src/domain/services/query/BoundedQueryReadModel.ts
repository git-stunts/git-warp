import MemoryBudgetError from '../../errors/MemoryBudgetError.ts';
import WarpMemoryPool from '../../memory/WarpMemoryPool.ts';
import type {
  QueryNeighborEntry,
  QueryNeighborOptions,
  QueryNodeStreamRequest,
  QueryPropertyBag,
  QueryReadModel,
} from './QueryReadModelProvider.ts';
import type { QueryNodeSnapshot } from './QueryPlan.ts';

export type BoundedQueryReadModelFields = {
  readonly source: QueryReadModel;
  readonly pool: WarpMemoryPool;
};

/** QueryReadModel wrapper that leases each streamed result from an explicit memory pool. */
export default class BoundedQueryReadModel implements QueryReadModel {
  readonly stateHash: string;
  private readonly _source: QueryReadModel;
  private readonly _pool: WarpMemoryPool;

  constructor(fields: BoundedQueryReadModelFields) {
    this._source = requireQueryReadModel(fields.source);
    this._pool = requireWarpMemoryPool(fields.pool);
    this.stateHash = this._source.stateHash;
    Object.freeze(this);
  }

  async *nodes(request: QueryNodeStreamRequest): AsyncIterable<QueryNodeSnapshot> {
    for await (const node of this._source.nodes(request)) {
      const lease = this._pool.acquire({ scope: 'query.nodes.result', amount: 1 });
      try {
        yield node;
      } finally {
        lease.release();
      }
    }
  }

  async *neighbors(
    nodeId: string,
    options: QueryNeighborOptions,
  ): AsyncIterable<QueryNeighborEntry> {
    for await (const neighbor of this._source.neighbors(nodeId, options)) {
      const lease = this._pool.acquire({ scope: 'query.neighbors.result', amount: 1 });
      try {
        yield neighbor;
      } finally {
        lease.release();
      }
    }
  }

  async nodeProps(nodeId: string): Promise<QueryPropertyBag | null> {
    const lease = this._pool.acquire({ scope: 'query.nodeProps.result', amount: 1 });
    try {
      return await this._source.nodeProps(nodeId);
    } finally {
      lease.release();
    }
  }
}

function requireQueryReadModel(value: QueryReadModel): QueryReadModel {
  if (hasQueryReadModelShape(value)) {
    return value;
  }
  throw new MemoryBudgetError('BoundedQueryReadModel requires a QueryReadModel source', {
    code: 'E_MEMORY_BUDGET_INVALID',
    context: { field: 'source' },
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

function requireWarpMemoryPool(value: WarpMemoryPool): WarpMemoryPool {
  if (value instanceof WarpMemoryPool) {
    return value;
  }
  throw new MemoryBudgetError('BoundedQueryReadModel requires a WarpMemoryPool', {
    code: 'E_MEMORY_BUDGET_INVALID',
    context: { field: 'pool' },
  });
}
