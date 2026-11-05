import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';

/** The approved finite limits an observation ran under. */
export default class ObservationBudget {
  readonly records: number;
  readonly bytes: number;
  readonly work: number;

  constructor(limits: { readonly records: number; readonly bytes: number; readonly work: number }) {
    if (![limits.records, limits.bytes, limits.work].every(isPositiveLimit)) {
      throw new ObservationCustodyError('Observation budget limits must be positive safe integers');
    }
    this.records = limits.records;
    this.bytes = limits.bytes;
    this.work = limits.work;
    Object.freeze(this);
  }
}

function isPositiveLimit(limit: number): boolean {
  return Number.isSafeInteger(limit) && limit > 0;
}
