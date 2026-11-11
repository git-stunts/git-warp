import { describe, expect, it } from 'vitest';

import GitProcessCount from '../../../benchmarks/cone-showcase/GitProcessCount.ts';
import { Margins } from '../../../benchmarks/cone-showcase/Margins.ts';
import { ScaleResult } from '../../../benchmarks/cone-showcase/ScaleResult.ts';
import WitnessOutcome from '../../../benchmarks/cone-showcase/WitnessOutcome.ts';
import WitnessSample, { type WitnessPhase } from '../../../benchmarks/cone-showcase/WitnessSample.ts';
import { WITNESS_PLAN } from '../../../benchmarks/cone-showcase/WitnessWorkload.ts';

const membership = new Margins('d0', new Map([['t0', ['c0']]]));
const verified = new WitnessOutcome('verified', '', membership);
const obstructed = new WitnessOutcome('incomplete', 'obstructed: missing_bounded_basis');

/** Planned 200-thread shape with one bulk write; only the read outcomes vary. */
function samples(read: (index: number) => WitnessOutcome): readonly WitnessSample[] {
  const plan: readonly [WitnessPhase, number][] = [['setup', 4], ['bulk', 1], ['save', 60], ['close', 2], ['margins', 30], ['cold', 5]];
  const all: WitnessSample[] = [];
  let reads = 0;
  for (const [phase, total] of plan) {
    for (let index = 0; index < total; index += 1) {
      const isRead = phase === 'margins' || phase === 'cold';
      const outcome = isRead ? read(reads++) : new WitnessOutcome(phase === 'bulk' || phase === 'save' ? 'retained' : 'completed', '');
      all.push(new WitnessSample({
        sequence: all.length, phase, operation: phase, documentId: 'd0', subjectId: 't0', count: new GitProcessCount([]), outcome,
      }));
    }
  }
  return all;
}

// Oracle: the read-check contract in benchmarks/cone-showcase/README.md (specified).
describe('cone-showcase read check line', () => {
  it('states that reads were not checked, and why, when every read is obstructed', () => {
    const result = new ScaleResult(200, 1, samples(() => obstructed), 1, WITNESS_PLAN);
    expect(result.summary()).toContain('read-check\t200\tunchecked\t0/35\tobstructed%3A%20missing_bounded_basis=35\n');
    expect(result.summary()).toMatch(/read-check[^\n]*\nscale-end\t200\tincomplete\n$/);
  });

  it('states verified membership only when all planned reads match the corpus', () => {
    const result = new ScaleResult(200, 1, samples(() => verified), 1, WITNESS_PLAN);
    expect(result.summary()).toContain('read-check\t200\tverified\t35/35\t-\n');
  });

  it('reports a membership mismatch ahead of unchecked reads', () => {
    const outcome = (index: number): WitnessOutcome => index === 0 ? new WitnessOutcome('mismatch', 'actual membership differs from corpus', membership)
      : index === 1 ? obstructed : verified;
    const result = new ScaleResult(200, 1, samples(outcome), 1, WITNESS_PLAN);
    expect(result.summary()).toContain(
      'read-check\t200\tmismatch\t33/35\tactual%20membership%20differs%20from%20corpus=1,obstructed%3A%20missing_bounded_basis=1\n',
    );
  });

  it('counts missing read samples as unchecked rather than verified', () => {
    const result = new ScaleResult(200, 1, samples(() => verified).slice(0, -1), 1, WITNESS_PLAN);
    expect(result.summary()).toContain('read-check\t200\tunchecked\t34/35\tmissing-sample=1\n');
  });
});
