/**
 * GCShouldRunResult — immutable outcome of a GC policy evaluation.
 *
 * `shouldRun === reasons.length > 0` is the invariant. Instances are
 * frozen so callers cannot weaken the contract after construction.
 *
 * @module domain/services/GCShouldRunResult
 */

export default class GCShouldRunResult {
  /** `true` iff at least one threshold was exceeded. */
  readonly shouldRun: boolean;

  /**
   * Human-readable reasons the policy decided to run (or didn't).
   * Empty array means no thresholds were exceeded.
   */
  readonly reasons: readonly string[];

  constructor(reasons: readonly string[]) {
    this.shouldRun = reasons.length > 0;
    this.reasons = Object.freeze([...reasons]);
    Object.freeze(this);
  }
}
