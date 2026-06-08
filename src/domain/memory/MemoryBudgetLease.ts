import MemoryBudgetError from '../errors/MemoryBudgetError.ts';
import { requireMemoryBudgetUnit, type MemoryBudgetUnit } from './MemoryBudgetUnit.ts';

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
    const validFields = requireMemoryBudgetLeaseFields(fields);
    this.id = requireNonEmptyString(validFields.id, 'id');
    this.name = requireNonEmptyString(validFields.name, 'name');
    this.scope = requireNonEmptyString(validFields.scope, 'scope');
    this.amount = requirePositiveInteger(validFields.amount, 'amount');
    this.unit = requireMemoryBudgetUnit(validFields.unit);
    this._releaseLease = requireReleaseLease(validFields.releaseLease);
    Object.freeze(this);
  }

  release(): void {
    this._releaseLease(this.id);
  }
}

function requireMemoryBudgetLeaseFields(
  fields: MemoryBudgetLeaseFields | null | undefined,
): MemoryBudgetLeaseFields {
  if (fields !== null && typeof fields === 'object') {
    return fields;
  }
  throw new MemoryBudgetError('MemoryBudgetLease requires object fields', {
    code: 'E_MEMORY_BUDGET_INVALID',
    context: { field: 'fields' },
  });
}

function requireReleaseLease(value: ReleaseLease): ReleaseLease {
  if (typeof value === 'function') {
    return value;
  }
  throw new MemoryBudgetError('Memory budget lease requires a release function', {
    code: 'E_MEMORY_BUDGET_INVALID',
    context: { field: 'releaseLease' },
  });
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
