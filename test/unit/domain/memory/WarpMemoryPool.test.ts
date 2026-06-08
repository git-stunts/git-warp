import { describe, expect, it } from 'vitest';

import MemoryBudget from '../../../../src/domain/memory/MemoryBudget.ts';
import MemoryBudgetLease from '../../../../src/domain/memory/MemoryBudgetLease.ts';
import MemoryBudgetError from '../../../../src/domain/errors/MemoryBudgetError.ts';
import MemoryCapability from '../../../../src/domain/memory/MemoryCapability.ts';
import MemoryCapabilityReport from '../../../../src/domain/memory/MemoryCapabilityReport.ts';
import WarpMemoryPool from '../../../../src/domain/memory/WarpMemoryPool.ts';
import WarpMemoryPoolSnapshot from '../../../../src/domain/memory/WarpMemoryPoolSnapshot.ts';

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

  it('rejects malformed runtime constructor inputs before field access', () => {
    // @ts-expect-error deliberate malformed constructor fixture
    expect(() => new MemoryBudget(null)).toThrow(MemoryBudgetError);
    // @ts-expect-error deliberate malformed constructor fixture
    expect(() => new MemoryBudgetLease(null)).toThrow(MemoryBudgetError);
    // @ts-expect-error deliberate malformed constructor fixture
    expect(() => new MemoryCapability(null)).toThrow(MemoryBudgetError);
    // @ts-expect-error deliberate malformed constructor fixture
    expect(() => new MemoryCapabilityReport(null)).toThrow(MemoryBudgetError);
    // @ts-expect-error deliberate malformed constructor fixture
    expect(() => new WarpMemoryPool(null)).toThrow(MemoryBudgetError);
    const pool = new WarpMemoryPool({
      name: 'pool',
      budget: MemoryBudget.bytes(1),
    });
    // @ts-expect-error deliberate malformed lease request fixture
    expect(() => pool.acquire(null)).toThrow(MemoryBudgetError);
  });

  it('rejects impossible memory-pool snapshots', () => {
    expect(() => new WarpMemoryPoolSnapshot({
      name: '',
      limit: -1,
      // @ts-expect-error deliberate malformed unit fixture
      unit: 'bogus',
      leased: -1,
      peak: -1,
      rejected: -1,
    })).toThrow(MemoryBudgetError);
    expect(() => new WarpMemoryPoolSnapshot({
      name: 'pool',
      limit: 1,
      unit: 'byte',
      leased: 2,
      peak: 1,
      rejected: 0,
    })).toThrow(MemoryBudgetError);
  });
});
