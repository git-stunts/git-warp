import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import GitProcessCounter from '../../../benchmarks/cone-showcase/GitProcessCounter.ts';
import SampleRecorder from '../../../benchmarks/cone-showcase/SampleRecorder.ts';
import WitnessOutcome from '../../../benchmarks/cone-showcase/WitnessOutcome.ts';
import WitnessReport from '../../../benchmarks/cone-showcase/WitnessReport.ts';
import type WitnessSample from '../../../benchmarks/cone-showcase/WitnessSample.ts';
import ConeShowcaseReportOutput from '../../fixtures/ConeShowcaseReportOutput.ts';

// Oracle: the README count contract (specified). A trace file stands for one Git
// process; the test writes complete records itself, so no Git process is needed.
const RECORD = '{"event":"exit","code":0}\n';
const SAVE = Object.freeze({ phase: 'save', operation: 'save', documentId: 'd0', subjectId: 'c0' } as const);

let scratch = '';
let traces = '';

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'cone-recorder-'));
  traces = join(scratch, 'trace');
  mkdirSync(traces);
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function traceProcess(name: string): void {
  writeFileSync(join(traces, name), RECORD);
}

function filesPerSample(samples: readonly WitnessSample[]): readonly (readonly string[] | null)[] {
  return samples.map((sample) => sample.count === null ? null : [...sample.count.files].sort());
}

describe('cone-showcase sample attribution', () => {
  it('counts a process in the sample whose operation traced it, and a late trace once in the next sample', async () => {
    const report = new WitnessReport(200, new ConeShowcaseReportOutput());
    const recorder = new SampleRecorder(new GitProcessCounter(traces), report);

    // Real Warp operations spawn Git only after their first await, so each
    // operation here yields before it traces: a capture taken before the
    // operation settles would miss these processes.
    await recorder.measure(SAVE, async () => {
      await Promise.resolve();
      traceProcess('during-0a');
      await Promise.resolve();
      traceProcess('during-0b');
      return new WitnessOutcome('retained', '');
    });
    traceProcess('after-0');
    await recorder.measure(SAVE, async () => {
      await Promise.resolve();
      traceProcess('during-1');
      return new WitnessOutcome('retained', '');
    });
    await recorder.measure(SAVE, () => new WitnessOutcome('retained', ''));

    expect(filesPerSample(report.samples)).toEqual([['during-0a', 'during-0b'], ['after-0', 'during-1'], []]);
    expect(report.samples.map((sample) => sample.sequence)).toEqual([0, 1, 2]);
  });

  it('retains a sample with no count and stops the run when the trace evidence is incomplete', async () => {
    const report = new WitnessReport(200, new ConeShowcaseReportOutput());
    const recorder = new SampleRecorder(new GitProcessCounter(traces), report);

    const failed = recorder.measure(SAVE, () => {
      writeFileSync(join(traces, 'partial'), '{"event":"start"');
      return new WitnessOutcome('retained', '');
    });

    await expect(failed).rejects.toThrow('trace observation is incomplete; stop before another operation');
    const [sample] = report.samples;
    expect(sample?.count).toBeNull();
    expect(sample?.outcome.status).toBe('error');
    expect(sample?.outcome.detail).toBe('trace incomplete: Git trace output has an incomplete final record');
  });

  it('records an operation failure as an error outcome but keeps its process count', async () => {
    const report = new WitnessReport(200, new ConeShowcaseReportOutput());
    const recorder = new SampleRecorder(new GitProcessCounter(traces), report);

    const outcome = await recorder.measure(SAVE, () => {
      traceProcess('failed-write');
      throw new RangeError('write refused');
    });

    expect(outcome.status).toBe('error');
    expect(outcome.detail).toBe('write refused');
    expect(filesPerSample(report.samples)).toEqual([['failed-write']]);
  });

  it('names a non-Error operation failure without losing the process count', async () => {
    const report = new WitnessReport(200, new ConeShowcaseReportOutput());
    const recorder = new SampleRecorder(new GitProcessCounter(traces), report);

    const outcome = await recorder.measure(SAVE, () => {
      traceProcess('odd-failure');
      throw 'not an Error';
    });

    expect(outcome.status).toBe('error');
    expect(outcome.detail).toBe('operation threw a non-Error value');
    expect(filesPerSample(report.samples)).toEqual([['odd-failure']]);
  });

  it('retains no count when the trace capture fails with a non-Error value', async () => {
    class ThrowingCounter extends GitProcessCounter {
      override capture(): never {
        throw 'not an Error';
      }
    }
    const report = new WitnessReport(200, new ConeShowcaseReportOutput());
    const recorder = new SampleRecorder(new ThrowingCounter(traces), report);

    const failed = recorder.measure(SAVE, () => new WitnessOutcome('retained', ''));

    await expect(failed).rejects.toThrow('trace observation is incomplete; stop before another operation');
    expect(report.samples.map((sample) => [sample.count, sample.outcome.detail]))
      .toEqual([[null, 'trace incomplete: trace capture failed']]);
  });
});
