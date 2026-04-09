/**
 * OpOutcomeResult — abstract base for CRDT operation outcomes.
 *
 * Subclasses carry outcome-specific data (winner EventId, reason, etc.)
 * instead of fragile tag strings. Downstream code uses `instanceof`
 * (or the narrow literal `result` discriminator) to branch.
 *
 * @module domain/types/ops/OpOutcomeResult
 */

/**
 * Abstract base: every outcome knows its target identifier and which
 * state it ended in. Concrete subclasses (OpApplied, OpSuperseded,
 * OpRedundant) live in their own files.
 */
export default abstract class OpOutcomeResult<
  R extends 'applied' | 'superseded' | 'redundant' = 'applied' | 'superseded' | 'redundant',
> {
  /** The entity ID or encoded key the op targeted. */
  readonly target: string;

  /** The literal outcome discriminator. */
  readonly result: R;

  constructor(target: string, result: R) {
    this.target = target;
    this.result = result;
  }
}
