const isCount = (value: number): boolean => Number.isSafeInteger(value) && value > 0;

/**
 * How many saves, warm margins reads and cold opens one scale performs after bulk loading.
 * The witness runs WITNESS_PLAN; a smaller plan keeps the same phase order and checks.
 */
export default class WorkloadPlan {
  readonly measuredSaves: number;
  readonly marginsReads: number;
  readonly coldOpens: number;

  constructor(counts: { readonly measuredSaves: number; readonly marginsReads: number; readonly coldOpens: number }) {
    if (![counts.measuredSaves, counts.marginsReads, counts.coldOpens].every(isCount)) {
      throw new RangeError('a workload plan needs a positive whole count of each operation');
    }
    this.measuredSaves = counts.measuredSaves;
    this.marginsReads = counts.marginsReads;
    this.coldOpens = counts.coldOpens;
    Object.freeze(this);
  }

  /** Warm and cold reads that the read check expects. */
  get plannedReads(): number {
    return this.marginsReads + this.coldOpens;
  }
}
