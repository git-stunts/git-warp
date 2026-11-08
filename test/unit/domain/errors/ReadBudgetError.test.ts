import { describe, expect, it } from 'vitest';
import ReadBudgetError from '../../../../src/domain/errors/ReadBudgetError.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

describe('ReadBudgetError', () => {
  it('constructs with default code and empty context', () => {
    const err = new ReadBudgetError('invalid budget');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(WarpError);
    expect(err).toBeInstanceOf(ReadBudgetError);
    expect(err.name).toBe('ReadBudgetError');
    expect(err.code).toBe('E_READ_BUDGET');
    expect(err.message).toBe('invalid budget');
    expect(err.context).toEqual({});
  });

  it('accepts options with custom code and context', () => {
    const err = new ReadBudgetError('budget exceeded', {
      code: 'E_READ_BUDGET_EXCEEDED',
      context: { records: 0 },
    });
    expect(err.code).toBe('E_READ_BUDGET_EXCEEDED');
    expect(err.context).toEqual({ records: 0 });
  });

  it('handles null and undefined options safely', () => {
    const err1 = new ReadBudgetError('null opts', null as unknown as undefined);
    expect(err1.code).toBe('E_READ_BUDGET');
    expect(err1.context).toEqual({});

    const err2 = new ReadBudgetError('undef opts', undefined);
    expect(err2.code).toBe('E_READ_BUDGET');
    expect(err2.context).toEqual({});
  });
});
