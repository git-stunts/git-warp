import MemoryBudgetError from '../errors/MemoryBudgetError.ts';
import {
  MEMORY_BUDGET_UNIT_BYTE,
  MEMORY_BUDGET_UNIT_ENTRY,
  MEMORY_BUDGET_UNIT_FACT,
  MEMORY_BUDGET_UNIT_PATCH,
  MEMORY_BUDGET_UNIT_RESULT,
  requireMemoryBudgetUnit,
  type MemoryBudgetUnit,
} from './MemoryBudgetUnit.ts';

export type MemoryBudgetFields = {
  readonly limit: number;
  readonly unit: MemoryBudgetUnit;
};

/** Immutable limit for git-warp-owned decoded buffers, caches, and windows. */
export default class MemoryBudget {
  readonly limit: number;
  readonly unit: MemoryBudgetUnit;

  constructor(fields: MemoryBudgetFields) {
    this.limit = requirePositiveInteger(fields.limit, 'limit');
    this.unit = requireMemoryBudgetUnit(fields.unit);
    Object.freeze(this);
  }

  static bytes(limit: number): MemoryBudget {
    return new MemoryBudget({ limit, unit: MEMORY_BUDGET_UNIT_BYTE });
  }

  static entries(limit: number): MemoryBudget {
    return new MemoryBudget({ limit, unit: MEMORY_BUDGET_UNIT_ENTRY });
  }

  static patches(limit: number): MemoryBudget {
    return new MemoryBudget({ limit, unit: MEMORY_BUDGET_UNIT_PATCH });
  }

  static facts(limit: number): MemoryBudget {
    return new MemoryBudget({ limit, unit: MEMORY_BUDGET_UNIT_FACT });
  }

  static results(limit: number): MemoryBudget {
    return new MemoryBudget({ limit, unit: MEMORY_BUDGET_UNIT_RESULT });
  }
}

function requirePositiveInteger(value: number, field: string): number {
  if (Number.isInteger(value) && value > 0) {
    return value;
  }
  throw new MemoryBudgetError('Memory budget limit must be a positive integer', {
    code: 'E_MEMORY_BUDGET_INVALID',
    context: { field, value },
  });
}
