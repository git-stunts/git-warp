import { describe, expect, it } from 'vitest';

import GitProcessCount from '../../../benchmarks/cone-showcase/GitProcessCount.ts';
import MarginCorpus from '../../../benchmarks/cone-showcase/MarginCorpus.ts';
import matchesCorpus from '../../../benchmarks/cone-showcase/MarginMembership.ts';
import { Margins, MarginsUnavailable } from '../../../benchmarks/cone-showcase/Margins.ts';
import { ScaleResult } from '../../../benchmarks/cone-showcase/ScaleResult.ts';
import WitnessOutcome, { type OutcomeStatus } from '../../../benchmarks/cone-showcase/WitnessOutcome.ts';
import WitnessReport from '../../../benchmarks/cone-showcase/WitnessReport.ts';
import WitnessSample from '../../../benchmarks/cone-showcase/WitnessSample.ts';
import ConeShowcaseReportOutput from '../../fixtures/ConeShowcaseReportOutput.ts';

// Oracle: the README "Output and completion" contract (specified): newline-terminated
// TSV records, URI percent encoding in sample, trace, membership and read-incomplete fields.
const IDENTITY = Object.freeze({ phase: 'margins', operation: 'read-margins', documentId: 'd0', subjectId: 'd0' } as const);

function readSample(sequence: number, outcome: WitnessOutcome): WitnessSample {
  return new WitnessSample({ sequence, ...IDENTITY, count: new GitProcessCount(['trace a', 'trace-b']), outcome });
}

describe('cone-showcase sample records', () => {
  it('frames actual membership, trace identities and the sample end', async () => {
    const output = new ConeShowcaseReportOutput();
    const report = new WitnessReport(200, output);
    const membership = new Margins('d0', new Map([['t0', ['c0', 'c1']], ['t1', []]]));

    await report.retain(readSample(0, new WitnessOutcome('verified', '', membership)));

    expect(output.lines).toEqual([
      'sample\t200\t0\tmargins\tread-margins\td0\td0\t2\tverified\t',
      'trace\t0\ttrace%20a',
      'trace\t0\ttrace-b',
      'membership\t0\td0\tt0\tc0\tc1',
      'membership\t0\td0\tt1',
      'membership-end\t0\td0\t2',
      'sample-end\t0',
    ]);
    expect(report.samples.map((sample) => sample.sequence)).toEqual([0]);
  });

  it('frames an unavailable read with its observer, status and reason', async () => {
    const output = new ConeShowcaseReportOutput();
    const report = new WitnessReport(2000, output);
    const refused = new MarginsUnavailable('cone-showcase.document-threads', 'obstructed', 'missing bounded basis');

    await report.retain(readSample(4, new WitnessOutcome('incomplete', 'obstructed: missing bounded basis', refused)));

    expect(output.lines).toEqual([
      'sample\t2000\t4\tmargins\tread-margins\td0\td0\t2\tincomplete\tobstructed%3A%20missing%20bounded%20basis',
      'trace\t4\ttrace%20a',
      'trace\t4\ttrace-b',
      'read-incomplete\t4\tcone-showcase.document-threads\tobstructed\tmissing%20bounded%20basis',
      'sample-end\t4',
    ]);
  });

  it('does not retain a sample whose record could not be written', async () => {
    const report = new WitnessReport(200, new ConeShowcaseReportOutput(new RangeError('output closed')));

    await expect(report.retain(readSample(0, new WitnessOutcome('verified', '')))).rejects.toThrow('output closed');
    expect(report.samples).toEqual([]);
  });
});

describe('cone-showcase evidence values', () => {
  it('treats only completed, retained and verified outcomes as complete', () => {
    const statuses: readonly OutcomeStatus[] = ['completed', 'retained', 'verified', 'incomplete', 'mismatch', 'error'];
    expect(statuses.map((status) => new WitnessOutcome(status, '').isComplete())).toEqual([true, true, true, false, false, false]);
  });

  it('refuses unknown outcomes and unbounded detail', () => {
    // @ts-expect-error Exercise the JavaScript boundary.
    expect(() => new WitnessOutcome('passed', '')).toThrow('a witness outcome must be known and its detail bounded');
    expect(() => new WitnessOutcome('error', 'x'.repeat(2049))).toThrow('a witness outcome must be known and its detail bounded');
    expect(new WitnessOutcome('error', 'x'.repeat(2048)).detail).toHaveLength(2048);
  });

  it.each([
    { sequence: -1 },
    { sequence: 1.5 },
    { phase: 'warmup' },
    { operation: '' },
    { operation: 'o'.repeat(129) },
    { documentId: 'd'.repeat(4097) },
    { subjectId: 's'.repeat(4097) },
  ])('refuses a sample without bounded, explicit identity: %o', (change) => {
    const fields = { sequence: 0, ...IDENTITY, count: null, outcome: new WitnessOutcome('error', ''), ...change };
    // @ts-expect-error Exercise the JavaScript boundary with an unknown phase.
    expect(() => new WitnessSample(fields)).toThrow('a witness sample needs bounded, explicit operation identity');
  });

  it.each([[0, 1, 1], [1, 0, 1], [1, 1, 0], [1.5, 1, 1]])('refuses a scale result with corpus counts %d, %d, %d', (threads, documents, bulk) => {
    expect(() => new ScaleResult(threads, documents, [], bulk)).toThrow('a scale result needs positive finite corpus and bulk counts');
  });

  it('refuses margins that are not corpus identities, or share one comment between threads', () => {
    expect(() => new Margins('document-0', new Map())).toThrow('a margins document must have its corpus identity');
    expect(() => new Margins('d0', new Map([['thread-0', ['c0']]]))).toThrow('margins membership must contain unique corpus identities');
    expect(() => new Margins('d0', new Map([['t0', ['c0', 'c0']]]))).toThrow('margins membership must contain unique corpus identities');
    expect(() => new Margins('d0', new Map([['t0', ['c0']], ['t1', ['c0']]]))).toThrow('a comment cannot belong to two margins threads');
  });

  it.each([['', 'obstructed', 'reason'], ['observer', '', 'reason'], ['observer', 'obstructed', '']])(
    'refuses an unavailable read without observer, status and reason: %o',
    (observer, status, reason) => {
      expect(() => new MarginsUnavailable(observer, status, reason)).toThrow('an incomplete margins read needs observer, status and reason');
    },
  );

  it('does not match membership read for another document, or for a document outside the corpus', () => {
    const corpus = new MarginCorpus(1);
    const actual = new Margins('d0', new Map([['t0', ['c0']]]));
    expect(matchesCorpus(actual, 'd0', corpus)).toBe(true);
    expect(matchesCorpus(actual, 'd1', corpus)).toBe(false);
    expect(matchesCorpus(new Margins('d1', new Map()), 'd1', corpus)).toBe(false);
  });
});
