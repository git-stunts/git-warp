import { describe, expect, it } from 'vitest';

import MemoryBudgetError from '../../../../../src/domain/errors/MemoryBudgetError.ts';
import MemoryBudget from '../../../../../src/domain/memory/MemoryBudget.ts';
import WarpMemoryPool from '../../../../../src/domain/memory/WarpMemoryPool.ts';
import BoundedQueryNodePageReader from '../../../../../src/domain/services/query/BoundedQueryNodePageReader.ts';
import type {
  QueryNeighborEntry,
  QueryNeighborOptions,
  QueryNodeStreamRequest,
  QueryPropertyBag,
  QueryReadModel,
} from '../../../../../src/domain/services/query/QueryReadModelProvider.ts';
import type { QueryNodeSnapshot } from '../../../../../src/domain/services/query/QueryPlan.ts';

describe('BoundedQueryNodePageReader', () => {
  it('reads cursorized node pages while retaining only returned nodes', async () => {
    const readModel = new FixtureReadModel([
      nodeSnapshot('node:1'),
      nodeSnapshot('node:2'),
      nodeSnapshot('node:3'),
      nodeSnapshot('node:4'),
      nodeSnapshot('node:5'),
    ]);
    const pool = nodePagePool(2);
    const reader = new BoundedQueryNodePageReader({ readModel, pool });

    const first = await reader.readPage({ pattern: 'User', select: ['name'], limit: 2 });
    const second = await reader.readPage({ pattern: 'User', select: ['name'], limit: 2, cursor: first.cursor });
    const third = await reader.readPage({ pattern: 'User', select: ['name'], limit: 2, cursor: second.cursor });

    expect(first.nodes.map((node) => node.id)).toEqual(['node:1', 'node:2']);
    expect(first.cursor).toBe('2');
    expect(second.nodes.map((node) => node.id)).toEqual(['node:3', 'node:4']);
    expect(second.cursor).toBe('4');
    expect(third.nodes.map((node) => node.id)).toEqual(['node:5']);
    expect(third.cursor).toBeNull();
    expect(readModel.requests).toEqual([
      { pattern: 'User', select: ['name'] },
      { pattern: 'User', select: ['name'] },
      { pattern: 'User', select: ['name'] },
    ]);
    expect(pool.snapshot()).toMatchObject({ leased: 0, peak: 2, rejected: 0 });
  });

  it('releases retained leases when the page exceeds the memory pool', async () => {
    const readModel = new FixtureReadModel([
      nodeSnapshot('node:1'),
      nodeSnapshot('node:2'),
    ]);
    const pool = nodePagePool(1);
    const reader = new BoundedQueryNodePageReader({ readModel, pool });

    await expect(reader.readPage({ pattern: 'User', select: null, limit: 2 }))
      .rejects.toBeInstanceOf(MemoryBudgetError);

    expect(pool.snapshot()).toMatchObject({ leased: 0, peak: 1, rejected: 1 });
  });

  it('rejects malformed fields and requests before streaming', async () => {
    const pool = nodePagePool(1);
    const readModel = new FixtureReadModel([nodeSnapshot('node:1')]);

    expect(() => new BoundedQueryNodePageReader({
      // @ts-expect-error deliberate malformed read model fixture
      readModel: null,
      pool,
    })).toThrow(MemoryBudgetError);
    expect(() => new BoundedQueryNodePageReader({
      readModel,
      // @ts-expect-error deliberate malformed memory pool fixture
      pool: null,
    })).toThrow(MemoryBudgetError);

    const reader = new BoundedQueryNodePageReader({ readModel, pool });
    await expect(reader.readPage({
      pattern: 'User',
      select: null,
      limit: 0,
    })).rejects.toBeInstanceOf(MemoryBudgetError);
    await expect(reader.readPage({
      pattern: 'User',
      select: null,
      limit: 1,
      cursor: '01',
    })).rejects.toBeInstanceOf(MemoryBudgetError);
    await expect(reader.readPage(null as never)).rejects.toBeInstanceOf(MemoryBudgetError);
  });
});

class FixtureReadModel implements QueryReadModel {
  readonly stateHash = 'fixture-state';
  readonly requests: QueryNodeStreamRequest[] = [];
  private readonly _nodes: readonly QueryNodeSnapshot[];

  constructor(nodes: readonly QueryNodeSnapshot[]) {
    this._nodes = nodes;
  }

  async *nodes(request: QueryNodeStreamRequest): AsyncIterable<QueryNodeSnapshot> {
    this.requests.push(request);
    for (const node of this._nodes) {
      yield node;
    }
  }

  async *neighbors(
    _nodeId: string,
    _options: QueryNeighborOptions,
  ): AsyncIterable<QueryNeighborEntry> {
  }

  async nodeProps(_nodeId: string): Promise<QueryPropertyBag | null> {
    return null;
  }
}

function nodePagePool(limit: number): WarpMemoryPool {
  return new WarpMemoryPool({
    name: 'bounded-query-node-page-reader',
    budget: MemoryBudget.results(limit),
  });
}

function nodeSnapshot(id: string): QueryNodeSnapshot {
  return {
    id,
    props: Object.freeze({ name: id }),
    edgesOut: Object.freeze([]),
    edgesIn: Object.freeze([]),
  };
}
