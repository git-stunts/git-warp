import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';

/** Explicit bounds on what one attempt may retain; crossing one refuses before arm. */
export default class ObservationSupportLimits {
  readonly writers: number;
  readonly dependencies: number;

  constructor(limits: { readonly writers: number; readonly dependencies: number }) {
    if (!isBound(limits.writers) || !isBound(limits.dependencies)) {
      throw new ObservationCustodyError('Observation support limits must be non-negative safe integers');
    }
    this.writers = limits.writers;
    this.dependencies = limits.dependencies;
    Object.freeze(this);
  }
}

function isBound(limit: number): boolean {
  return Number.isSafeInteger(limit) && limit >= 0;
}
