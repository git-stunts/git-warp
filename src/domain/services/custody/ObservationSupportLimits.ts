import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';

/**
 * Explicit bounds on one attempt's support. Crossing one while building refuses
 * before arm. Verifying applies all but `dependencies`, and crossing one then reports
 * an unavailable outcome.
 */
export default class ObservationSupportLimits {
  /** Distinct writer heads a basis may require. */
  readonly writers: number;
  /** Dependency objects an attempt may require. */
  readonly dependencies: number;
  /** Bytes of the stored basis frontier, checked before it is read. */
  readonly frontierBytes: number;
  /** Object checks and reads one build or one verification may perform. */
  readonly work: number;

  constructor(limits: {
    readonly writers: number;
    readonly dependencies: number;
    readonly frontierBytes: number;
    readonly work: number;
  }) {
    if (![limits.writers, limits.dependencies, limits.frontierBytes, limits.work].every(isBound)) {
      throw new ObservationCustodyError('Observation support limits must be non-negative safe integers');
    }
    this.writers = limits.writers;
    this.dependencies = limits.dependencies;
    this.frontierBytes = limits.frontierBytes;
    this.work = limits.work;
    Object.freeze(this);
  }
}

function isBound(limit: number): boolean {
  return Number.isSafeInteger(limit) && limit >= 0;
}
