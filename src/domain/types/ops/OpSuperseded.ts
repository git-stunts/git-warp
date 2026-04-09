/**
 * OpSuperseded — the operation was overridden by a concurrent write
 * with a higher EventId under LWW semantics.
 *
 * @module domain/types/ops/OpSuperseded
 */

import OpOutcomeResult from './OpOutcomeResult.ts';
import type { EventId } from '../../utils/EventId.ts';

export default class OpSuperseded extends OpOutcomeResult<'superseded'> {
  /** The winning EventId under LWW comparison. */
  readonly winner: EventId;

  /** Human-readable explanation. */
  readonly reason: string;

  constructor(target: string, winner: EventId) {
    super(target, 'superseded');
    this.winner = winner;
    this.reason = `LWW: writer ${winner.writerId} at lamport ${winner.lamport} wins`;
    Object.freeze(this);
  }
}
