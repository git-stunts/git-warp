import { describe, expect, it } from 'vitest';

import CountSpread from '../../../benchmarks/cone-showcase/CountSpread.ts';
import GitProcessCount from '../../../benchmarks/cone-showcase/GitProcessCount.ts';
import { Margins } from '../../../benchmarks/cone-showcase/Margins.ts';
import PhaseCounts from '../../../benchmarks/cone-showcase/PhaseCounts.ts';
import { ScaleResult } from '../../../benchmarks/cone-showcase/ScaleResult.ts';
import WitnessOutcome from '../../../benchmarks/cone-showcase/WitnessOutcome.ts';
import WitnessSample, { type WitnessPhase } from '../../../benchmarks/cone-showcase/WitnessSample.ts';
import { WITNESS_PLAN } from '../../../benchmarks/cone-showcase/WitnessWorkload.ts';

function sample(sequence: number, phase: WitnessPhase, count: GitProcessCount | null, outcome: WitnessOutcome): WitnessSample {
  return new WitnessSample({ sequence, phase, operation: phase, documentId: 'd0', subjectId: 't0', count, outcome });
}

function completeSamples(): readonly WitnessSample[] {
  const samples: WitnessSample[] = [];
  const add = (phase: WitnessPhase, total: number, outcome: WitnessOutcome): void => {
    for (let index = 0; index < total; index += 1) {
      samples.push(sample(samples.length, phase, new GitProcessCount([]), outcome));
    }
  };
  add('setup', 4, new WitnessOutcome('completed', ''));
  add('bulk', 1, new WitnessOutcome('retained', ''));
  add('save', 60, new WitnessOutcome('retained', ''));
  const membership = new Margins('d0', new Map([['t0', ['c0']]]));
  add('margins', 30, new WitnessOutcome('verified', '', membership));
  add('cold', 5, new WitnessOutcome('verified', '', membership));
  add('close', 2, new WitnessOutcome('completed', ''));
  return samples;
}

describe('cone-showcase aggregate evidence', () => {
  it('derives counts from measured samples without treating missing observations as zero', () => {
    const counts = new PhaseCounts([
      sample(0, 'save', new GitProcessCount(['a', 'b', 'c']), new WitnessOutcome('retained', '')),
      sample(1, 'save', null, new WitnessOutcome('error', 'trace missing')),
      sample(2, 'save', new GitProcessCount([]), new WitnessOutcome('incomplete', 'receipt refused')),
      sample(3, 'save', new GitProcessCount(['d']), new WitnessOutcome('retained', '')),
    ]);
    expect(counts.samples).toBe(4);
    expect(counts.measured).toBe(3);
    expect(counts.gitProcesses).toEqual(new CountSpread([0, 1, 3]));
    expect([...counts.results]).toEqual([['retained', 2], ['error', 1], ['incomplete', 1]]);
    expect(new CountSpread([])).toEqual({ min: null, p50: null, max: null });
    expect(new CountSpread([9, 1, 5, 3])).toEqual({ min: 1, p50: 3, max: 9 });
    expect(() => new CountSpread([-1])).toThrow(RangeError);
    expect(() => new GitProcessCount(['duplicate', 'duplicate'])).toThrow();
  });

  it('accepts complete evidence without imposing a performance ceiling', () => {
    const samples = [...completeSamples()];
    const first = samples[0];
    if (first === undefined) throw new TypeError('the literal complete fixture is empty');
    samples[0] = sample(0, 'setup', new GitProcessCount(Array.from({ length: 500 }, (_, index) => 'process-' + String(index))), first.outcome);
    const result = new ScaleResult(200, 1, samples, 1, WITNESS_PLAN);
    expect(result.isComplete()).toBe(true);
    expect(result.summary()).toContain('aggregate\t200\tsave\t60\t60\t0\t0\t0\tretained=60\n');
    expect(result.summary()).toContain('scale-end\t200\tcomplete\n');
  });

  it.each(['missing-count', 'incomplete-read', 'wrong-document', 'no-membership', 'wrong-sequence', 'missing-sample'])(
    'keeps deficient evidence visibly incomplete: %s', (fault) => {
      const samples = [...completeSamples()];
      const index = samples.findIndex((entry) => entry.phase === 'cold');
      const original = samples[index];
      if (original === undefined) throw new TypeError('the literal complete fixture has no cold sample');
      if (fault === 'missing-count') samples[index] = sample(index, 'cold', null, original.outcome);
      if (fault === 'incomplete-read') samples[index] = sample(index, 'cold', original.count, new WitnessOutcome('incomplete', 'read refused'));
      if (fault === 'wrong-document') samples[index] = sample(index, 'cold', original.count, new WitnessOutcome('verified', '', new Margins('d1', new Map())));
      if (fault === 'no-membership') samples[index] = sample(index, 'cold', original.count, new WitnessOutcome('verified', ''));
      if (fault === 'wrong-sequence') samples[index] = sample(index + 1, 'cold', original.count, original.outcome);
      if (fault === 'missing-sample') samples.splice(index, 1);
      const result = new ScaleResult(200, 1, samples, 1, WITNESS_PLAN);
      expect(result.isComplete()).toBe(false);
      expect(result.summary()).toContain('scale-end\t200\tincomplete\n');
    },
  );
});
