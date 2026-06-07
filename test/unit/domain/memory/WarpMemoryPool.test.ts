import { describe, expect, it } from 'vitest';

import MemoryBudget from '../../../../src/domain/memory/MemoryBudget.ts';
import MemoryBudgetError from '../../../../src/domain/errors/MemoryBudgetError.ts';
import WarpMemoryPool from '../../../../src/domain/memory/WarpMemoryPool.ts';

describe('WarpMemoryPool', () => {
  it('leases and releases bounded graph-owned memory deterministically', () => {
    const pool = new WarpMemoryPool({
      name: 'large-graph-read',
      budget: MemoryBudget.bytes(16),
    });

    const first = pool.acquire({ scope: 'patch-batch', amount: 6 });
    const second = pool.acquire({ scope: 'result-window', amount: 7 });

    expect(first.amount).toBe(6);
    expect(second.amount).toBe(7);
    expect(pool.snapshot()).toMatchObject({
      name: 'large-graph-read',
      limit: 16,
      leased: 13,
      peak: 13,
      rejected: 0,
      unit: 'byte',
    });

    first.release();
    second.release();
    second.release();

    expect(pool.snapshot()).toMatchObject({
      leased: 0,
      peak: 13,
      rejected: 0,
    });
  });

  it('rejects over-budget leases with reproducible evidence context', () => {
    const pool = new WarpMemoryPool({
      name: 'large-graph-read',
      budget: MemoryBudget.bytes(8),
    });

    pool.acquire({ scope: 'patch-batch', amount: 5 });

    let captured: MemoryBudgetError | null = null;
    try {
      pool.acquire({ scope: 'result-window', amount: 4 });
    } catch (error) {
      if (error instanceof MemoryBudgetError) {
        captured = error;
      }
    }

    expect(captured).toBeInstanceOf(MemoryBudgetError);
    expect(captured).toMatchObject({
      code: 'E_MEMORY_BUDGET_EXCEEDED',
      context: {
        name: 'large-graph-read',
        scope: 'result-window',
        unit: 'byte',
        limit: 8,
        leased: 5,
        requested: 4,
        rejected: 1,
      },
    });
  });

  it('rejects invalid budget contracts before a pool can run', () => {
    expect(() => MemoryBudget.bytes(0)).toThrow(MemoryBudgetError);
    expect(() => MemoryBudget.entries(1.5)).toThrow(MemoryBudgetError);
    expect(() => new WarpMemoryPool({
      name: '',
      budget: MemoryBudget.bytes(1),
    })).toThrow(MemoryBudgetError);
  });
});
