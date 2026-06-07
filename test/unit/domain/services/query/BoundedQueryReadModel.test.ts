import { describe, expect, it } from 'vitest';

import MemoryBudgetError from '../../../../../src/domain/errors/MemoryBudgetError.ts';
import MemoryBudget from '../../../../../src/domain/memory/MemoryBudget.ts';
import WarpMemoryPool from '../../../../../src/domain/memory/WarpMemoryPool.ts';
import BoundedQueryReadModel from '../../../../../src/domain/services/query/BoundedQueryReadModel.ts';

describe('BoundedQueryReadModel', () => {
  it('rejects malformed sources before property access', () => {
    const pool = new WarpMemoryPool({
      name: 'bounded-query-read-model',
      budget: MemoryBudget.entries(1),
    });

    expect(() => new BoundedQueryReadModel({
      // @ts-expect-error deliberate malformed source fixture
      source: null,
      pool,
    })).toThrow(MemoryBudgetError);
  });
});
