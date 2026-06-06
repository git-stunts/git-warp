import MemoryBudgetError from '../errors/MemoryBudgetError.ts';
import type { MemoryBudgetUnit } from './MemoryBudgetUnit.ts';

type ReleaseLease = (id: string) => void;

export type MemoryBudgetLeaseFields = {
  readonly id: string;
  readonly name: string;
  readonly scope: string;
  readonly amount: number;
  readonly unit: MemoryBudgetUnit;
  readonly releaseLease: ReleaseLease;
};

/** Runtime lease against a WarpMemoryPool budget. */
export default class MemoryBudgetLease {
  readonly id: string;
  readonly name: string;
  readonly scope: string;
  readonly amount: number;
  readonly unit: MemoryBudgetUnit;
  private readonly _releaseLease: ReleaseLease;

  constructor(fields: MemoryBudgetLeaseFields) {
    this.id = requireNonEmptyString(fields.id, 'id');
    this.name = requireNonEmptyString(fields.name, 'name');
    this.scope = requireNonEmptyString(fields.scope, 'scope');
    this.amount = requirePositiveInteger(fields.amount, 'amount');
    this.unit = fields.unit;
    this._releaseLease = fields.releaseLease;
    Object.freeze(this);
  }

  release(): void {
    this._releaseLease(this.id);
  }
}

function requireNonEmptyString(value: string, field: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  throw new MemoryBudgetError('Memory budget lease requires non-empty identity fields', {
    code: 'E_MEMORY_BUDGET_INVALID',
    context: { field },
  });
}

function requirePositiveInteger(value: number, field: string): number {
  if (Number.isInteger(value) && value > 0) {
    return value;
  }
  throw new MemoryBudgetError('Memory budget lease amount must be a positive integer', {
    code: 'E_MEMORY_BUDGET_INVALID',
    context: { field, value },
  });
}
