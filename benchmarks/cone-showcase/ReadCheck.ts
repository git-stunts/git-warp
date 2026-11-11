import type WitnessSample from './WitnessSample.ts';
import { COLD_OPENS, MARGINS_READS } from './WitnessWorkload.ts';

export type ReadCheckState = 'verified' | 'unchecked' | 'mismatch';

const PLANNED_READS = MARGINS_READS + COLD_OPENS;
const MISSING_SAMPLE = 'missing-sample';

/**
 * Whether read membership was checked at one scale, and why not.
 * Any mismatch outranks unchecked reads; a missing read sample is unchecked.
 */
export default class ReadCheck {
  readonly threads: number;
  readonly state: ReadCheckState;
  readonly verified: number;
  readonly reasons: ReadonlyMap<string, number>;

  constructor(threads: number, samples: readonly WitnessSample[]) {
    const reads = samples.filter((sample) => sample.phase === 'margins' || sample.phase === 'cold');
    const reasons = new Map<string, number>();
    for (const read of reads.filter((sample) => sample.outcome.status !== 'verified')) {
      reasons.set(read.outcome.detail, (reasons.get(read.outcome.detail) ?? 0) + 1);
    }
    if (reads.length < PLANNED_READS) {
      reasons.set(MISSING_SAMPLE, PLANNED_READS - reads.length);
    }
    this.threads = threads;
    this.verified = reads.filter((sample) => sample.outcome.status === 'verified').length;
    this.reasons = reasons;
    this.state = reads.some((sample) => sample.outcome.status === 'mismatch') ? 'mismatch'
      : reasons.size === 0 ? 'verified' : 'unchecked';
    Object.freeze(this);
  }

  /** `read-check`, threads, state, verified/planned, and percent-encoded reason=count pairs or `-`. */
  line(): string {
    const reasons = [...this.reasons].map(([reason, count]) => encodeURIComponent(reason) + '=' + String(count)).join(',');
    return ['read-check', String(this.threads), this.state, String(this.verified) + '/' + String(PLANNED_READS), reasons || '-'].join('\t');
  }
}
