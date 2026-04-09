/**
 * OpApplied — the operation was applied to the state.
 *
 * @module domain/types/ops/OpApplied
 */

import OpOutcomeResult from './OpOutcomeResult.ts';

export default class OpApplied extends OpOutcomeResult<'applied'> {
  constructor(target: string) {
    super(target, 'applied');
    Object.freeze(this);
  }
}
