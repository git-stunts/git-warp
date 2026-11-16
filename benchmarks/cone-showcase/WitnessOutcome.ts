import type { MarginsRead } from './Margins.ts';

export type OutcomeStatus = 'completed' | 'retained' | 'verified' | 'incomplete' | 'mismatch' | 'error';
const STATUSES: ReadonlySet<string> = new Set(['completed', 'retained', 'verified', 'incomplete', 'mismatch', 'error']);

/** What the public operation actually returned, with actual membership when read. */
export default class WitnessOutcome {
  readonly status: OutcomeStatus;
  readonly detail: string;
  readonly membership: MarginsRead | null;

  constructor(status: OutcomeStatus, detail: string, membership: MarginsRead | null = null) {
    if (!STATUSES.has(status) || detail.length > 2048) {
      throw new TypeError('a witness outcome must be known and its detail bounded');
    }
    this.status = status;
    this.detail = detail;
    this.membership = membership;
    Object.freeze(this);
  }

  isComplete(): boolean {
    return this.status === 'completed' || this.status === 'retained' || this.status === 'verified';
  }
}
