import { describe, expect, it } from 'vitest';
import ReadBudget from '../../../../src/domain/api/ReadBudget.ts';
import ReadBudgetError from '../../../../src/domain/errors/ReadBudgetError.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

describe('ReadBudget', () => {
  it('constructs a frozen read budget with finite positive limits', () => {
    const budget = ReadBudget.of({ records: 5, bytes: 2048, work: 50 });
    expect(budget.records).toBe(5);
    expect(budget.bytes).toBe(2048);
    expect(budget.work).toBe(50);
    expect(Object.isFrozen(budget)).toBe(true);
  });

  it('refuses non-positive limits', () => {
    expect(() => ReadBudget.of({ records: 0, bytes: 100, work: 100 })).toThrow(ReadBudgetError);
    expect(() => ReadBudget.of({ records: 0, bytes: 100, work: 100 })).toThrow(WarpError);
    expect(() => ReadBudget.of({ records: 10, bytes: 0, work: 100 })).toThrow(ReadBudgetError);
    expect(() => ReadBudget.of({ records: 10, bytes: 100, work: 0 })).toThrow(ReadBudgetError);
    expect(() => ReadBudget.of({ records: -1, bytes: 100, work: 100 })).toThrow(ReadBudgetError);
    expect(() => ReadBudget.of({ records: 10, bytes: -10, work: 100 })).toThrow(ReadBudgetError);
    expect(() => ReadBudget.of({ records: 10, bytes: 100, work: -5 })).toThrow(ReadBudgetError);
  });

  it('refuses fractional, non-integer or unsafe limits', () => {
    expect(() => ReadBudget.of({ records: 1.5, bytes: 100, work: 100 })).toThrow(ReadBudgetError);
    expect(() => ReadBudget.of({ records: 10, bytes: 100.5, work: 100 })).toThrow(ReadBudgetError);
    expect(() => ReadBudget.of({ records: 10, bytes: 100, work: 1.2 })).toThrow(ReadBudgetError);
    expect(() => ReadBudget.of({ records: NaN, bytes: 100, work: 100 })).toThrow(ReadBudgetError);
    expect(() => ReadBudget.of({ records: 10, bytes: Infinity, work: 100 })).toThrow(ReadBudgetError);
    expect(() => ReadBudget.of({ records: 10, bytes: 100, work: Number.MAX_SAFE_INTEGER + 1 })).toThrow(ReadBudgetError);
  });
});
