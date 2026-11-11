import PhaseCounts from './PhaseCounts.ts';
import ReadCheck from './ReadCheck.ts';
import { Margins } from './Margins.ts';
import type WitnessSample from './WitnessSample.ts';
import type WorkloadPlan from './WorkloadPlan.ts';

/** Exact retained evidence for one scale, with no performance ceiling. */
export class ScaleResult {
  readonly threads: number;
  readonly documents: number;
  readonly samples: readonly WitnessSample[];
  readonly expectedBulk: number;
  readonly workload: WorkloadPlan;

  constructor(threads: number, documents: number, samples: readonly WitnessSample[], expectedBulk: number, workload: WorkloadPlan) {
    if (![threads, documents, expectedBulk].every((value) => Number.isSafeInteger(value) && value > 0)) {
      throw new RangeError('a scale result needs positive finite corpus and bulk counts');
    }
    this.threads = threads;
    this.documents = documents;
    this.samples = Object.freeze([...samples]);
    this.expectedBulk = expectedBulk;
    this.workload = workload;
    Object.freeze(this);
  }

  isComplete(): boolean {
    const count = (phase: string): number => this.samples.filter((sample) => sample.phase === phase).length;
    return count('bulk') === this.expectedBulk && count('save') === this.workload.measuredSaves
      && count('margins') === this.workload.marginsReads && count('cold') === this.workload.coldOpens
      && count('setup') === 4 && count('close') === 2
      && this.samples.every((sample, index) => {
        const expected = sample.phase === 'bulk' || sample.phase === 'save' ? 'retained'
          : sample.phase === 'margins' || sample.phase === 'cold' ? 'verified' : 'completed';
        const read = sample.phase === 'margins' || sample.phase === 'cold';
        return sample.sequence === index && sample.count !== null && sample.outcome.status === expected
          && (!read || (sample.outcome.membership instanceof Margins && sample.outcome.membership.documentId === sample.documentId));
      });
  }

  summary(): string {
    const rows = ['bulk', 'save', 'margins', 'cold'].map((phase) => {
      const counts = new PhaseCounts(this.samples.filter((sample) => sample.phase === phase));
      const outcomes = [...counts.results].map(([outcome, count]) => outcome + '=' + String(count)).join(',');
      return [
        'aggregate', String(this.threads), phase, String(counts.samples), String(counts.measured),
        String(counts.gitProcesses.min), String(counts.gitProcesses.p50), String(counts.gitProcesses.max), outcomes,
      ].join('\t');
    });
    rows.push(new ReadCheck(this.threads, this.samples, this.workload).line());
    rows.push(['scale-end', String(this.threads), this.isComplete() ? 'complete' : 'incomplete'].join('\t'));
    return rows.join('\n') + '\n';
  }
}
