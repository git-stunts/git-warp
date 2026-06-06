import MemoryBudgetError from '../errors/MemoryBudgetError.ts';

export type MemoryBudgetUnit = 'byte' | 'entry' | 'patch' | 'fact' | 'result';

export const MEMORY_BUDGET_UNIT_BYTE: MemoryBudgetUnit = 'byte';
export const MEMORY_BUDGET_UNIT_ENTRY: MemoryBudgetUnit = 'entry';
export const MEMORY_BUDGET_UNIT_PATCH: MemoryBudgetUnit = 'patch';
export const MEMORY_BUDGET_UNIT_FACT: MemoryBudgetUnit = 'fact';
export const MEMORY_BUDGET_UNIT_RESULT: MemoryBudgetUnit = 'result';

export const MEMORY_BUDGET_UNITS: readonly MemoryBudgetUnit[] = Object.freeze([
  MEMORY_BUDGET_UNIT_BYTE,
  MEMORY_BUDGET_UNIT_ENTRY,
  MEMORY_BUDGET_UNIT_PATCH,
  MEMORY_BUDGET_UNIT_FACT,
  MEMORY_BUDGET_UNIT_RESULT,
]);

export function requireMemoryBudgetUnit(value: string): MemoryBudgetUnit {
  const unit = MEMORY_BUDGET_UNITS.find((candidate) => candidate === value);
  if (unit !== undefined) {
    return unit;
  }
  throw new MemoryBudgetError('Memory budget unit is not supported', {
    code: 'E_MEMORY_BUDGET_INVALID',
    context: { field: 'unit', value },
  });
}
