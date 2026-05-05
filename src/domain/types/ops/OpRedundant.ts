/**
 * OpRedundant — the operation had no effect; the state was already
 * in the post-op condition (idempotent re-delivery).
 *
 * @module domain/types/ops/OpRedundant
 */

import OpOutcomeResult from './OpOutcomeResult.ts';

export default class OpRedundant extends OpOutcomeResult<'redundant'> {
  constructor(target: string) {
    super(target, 'redundant');
    Object.freeze(this);
  }
}
