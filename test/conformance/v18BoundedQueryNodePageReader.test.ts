import { describe, expect, it } from 'vitest';

import MemoryBudgetError from '../../src/domain/errors/MemoryBudgetError.ts';
import BoundedQueryNodePageReader from '../../src/domain/services/query/BoundedQueryNodePageReader.ts';
import type {
  QueryNeighborEntry,
  QueryNeighborOptions,
  QueryNodeStreamRequest,
  QueryPropertyBag,
  QueryReadModel,
} from '../../src/domain/services/query/QueryReadModelProvider.ts';
import type { QueryNodeSnapshot } from '../../src/domain/services/query/QueryPlan.ts';
import V18LargeGraphOverSmallPoolFixture from './fixtures/V18LargeGraphOverSmallPoolFixture.ts';

describe('v18 bounded query node page reader', () => {
  it('reads the canonical large fixture through deterministic bounded pages', async () => {
    const fixture = new V18LargeGraphOverSmallPoolFixture();
    const reader = new BoundedQueryNodePageReader({
      readModel: fixture.readModel(),
      pool: fixture.pool,
    });

    const first = await reader.readPage({ pattern: '*', select: null, limit: 2 });
    const second = await reader.readPage({ pattern: '*', select: null, limit: 2, cursor: first.cursor });
    const third = await reader.readPage({ pattern: '*', select: null, limit: 2, cursor: second.cursor });

    expect(first.nodes.map((node) => node.id)).toEqual(['v18:node:00', 'v18:node:01']);
    expect(first.cursor).toBe('2');
    expect(second.nodes.map((node) => node.id)).toEqual(['v18:node:02', 'v18:node:03']);
    expect(second.cursor).toBe('4');
    expect(third.nodes.map((node) => node.id)).toEqual(['v18:node:04', 'v18:node:05']);
    expect(third.cursor).toBeNull();
    expect(fixture.pool.snapshot()).toMatchObject({ leased: 0, peak: 2, rejected: 0 });
  });

  it('rejects retained pages that exceed the memory pool', async () => {
    const fixture = new V18LargeGraphOverSmallPoolFixture();
    const reader = new BoundedQueryNodePageReader({
      readModel: fixture.readModel(),
      pool: fixture.pool,
    });

    await expect(reader.readPage({ pattern: '*', select: null, limit: 3 }))
      .rejects.toBeInstanceOf(MemoryBudgetError);
    expect(fixture.pool.snapshot()).toMatchObject({ leased: 0, peak: 2, rejected: 1 });
  });

  it('rejects malformed read models before field access', () => {
    const fixture = new V18LargeGraphOverSmallPoolFixture();

    expect(() => new BoundedQueryNodePageReader({
      // @ts-expect-error deliberate malformed read-model fixture
      readModel: null,
      pool: fixture.pool,
    })).toThrow(MemoryBudgetError);
  });

  it('passes only canonical node stream fields to the source read model', async () => {
    const fixture = new V18LargeGraphOverSmallPoolFixture();
    const readModel = new RecordingQueryReadModel();
    const reader = new BoundedQueryNodePageReader({
      readModel,
      pool: fixture.pool,
    });

    const page = await reader.readPage({ pattern: '*', select: null, limit: 1, cursor: '0' });

    expect(page.nodes.map((node) => node.id)).toEqual(['recorded:node']);
    expect(page.cursor).toBe('1');
    expect(readModel.requestKeys).toEqual([['pattern', 'select']]);
  });
});

class RecordingQueryReadModel implements QueryReadModel {
  readonly stateHash = 'recording-query-read-model';
  readonly requestKeys: string[][];

  constructor() {
    this.requestKeys = [];
  }

  async *nodes(request: QueryNodeStreamRequest): AsyncIterable<QueryNodeSnapshot> {
    this.requestKeys.push(Object.keys(request).sort());
    yield queryNode('recorded:node');
    yield queryNode('recorded:next');
  }

  async *neighbors(
    _nodeId: string,
    _options: QueryNeighborOptions,
  ): AsyncIterable<QueryNeighborEntry> {}

  nodeProps(_nodeId: string): Promise<QueryPropertyBag | null> {
    return Promise.resolve(null);
  }
}

function queryNode(id: string): QueryNodeSnapshot {
  return Object.freeze({
    id,
    props: Object.freeze({}),
    edgesOut: Object.freeze([]),
    edgesIn: Object.freeze([]),
  });
}
