import ReadBudgetError from '../errors/ReadBudgetError.ts';

/** Finite limits on one read: records it may read, bytes it may emit, and work it may do. */
export default class ReadBudget {
  readonly records: number;
  readonly bytes: number;
  readonly work: number;

  private constructor(limits: { readonly records: number; readonly bytes: number; readonly work: number }) {
    if (!isValidLimits(limits)) {
      throw new ReadBudgetError('A read budget needs finite positive limits');
    }
    this.records = limits.records;
    this.bytes = limits.bytes;
    this.work = limits.work;
    Object.freeze(this);
  }

  static of(limits: { readonly records: number; readonly bytes: number; readonly work: number }): ReadBudget {
    return new ReadBudget(limits);
  }
}

function isValidLimits(limits: { readonly records: number; readonly bytes: number; readonly work: number }): boolean {
  if (typeof limits !== 'object' || limits === null) {
    return false;
  }
  return [limits.records, limits.bytes, limits.work].every((limit) => Number.isSafeInteger(limit) && limit > 0);
}

