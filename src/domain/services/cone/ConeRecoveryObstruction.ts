import ConeRecordError from '../../errors/ConeRecordError.ts';
import { EventId } from '../../utils/EventId.ts';
import ConeObstruction from './ConeObstruction.ts';

export type ConeRecoveryReason = 'source-required' | 'unavailable' | 'inconsistent';
const REASONS: ReadonlySet<string> = new Set(['source-required', 'unavailable', 'inconsistent']);

/** An evicted value cannot be recovered faithfully; the basis must not advance. */
export default class ConeRecoveryObstruction extends ConeObstruction {
  readonly code = 'E_CONE_RECOVERY';
  readonly event: EventId;
  readonly reason: ConeRecoveryReason;

  constructor(event: EventId, reason: ConeRecoveryReason) {
    super();
    if (!(event instanceof EventId) || !REASONS.has(reason)) {
      throw new ConeRecordError('Cone recovery obstruction needs an event and a recovery reason');
    }
    this.event = event;
    this.reason = reason;
    Object.freeze(this);
  }

  describe(): string {
    return `Cannot recover event ${this.event.patchSha}:${this.event.opIndex} (${this.reason}); restore its authoritative patch source before retrying`;
  }
}
