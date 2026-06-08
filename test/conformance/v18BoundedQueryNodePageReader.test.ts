import { describe, expect, it } from 'vitest';

import MemoryBudgetError from '../../src/domain/errors/MemoryBudgetError.ts';
import BoundedQueryNodePageReader from '../../src/domain/services/query/BoundedQueryNodePageReader.ts';
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
});
