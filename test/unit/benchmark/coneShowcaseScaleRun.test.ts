import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import GitProcessCounter, { TRACE_FILE_LIMIT } from '../../../benchmarks/cone-showcase/GitProcessCounter.ts';
import MarginCorpus from '../../../benchmarks/cone-showcase/MarginCorpus.ts';
import { expectedBulkPatches, runScale } from '../../../benchmarks/cone-showcase/ScaleRun.ts';
import WitnessReport from '../../../benchmarks/cone-showcase/WitnessReport.ts';
import { COLD_OPENS, MARGINS_READS, MEASURED_SAVES } from '../../../benchmarks/cone-showcase/WitnessWorkload.ts';
import ConeShowcaseReportOutput from '../../fixtures/ConeShowcaseReportOutput.ts';

const RUN_TIMEOUT_MS = 120_000;

afterEach(() => {
  vi.unstubAllEnvs();
});

/** The private Git configuration the launcher writes: one Trace2 event file per Git process. */
function traceConfiguration(scratch: string): string {
  const traces = join(scratch, 'traces');
  mkdirSync(traces);
  const config = join(scratch, 'gitconfig');
  writeFileSync(config, '[trace2]\n\teventTarget = "' + traces + '"\n\tmaxFiles = ' + String(TRACE_FILE_LIMIT - 1) + '\n');
  vi.stubEnv('GIT_CONFIG_GLOBAL', config);
  return traces;
}

describe('cone-showcase scale run', () => {
  // Oracle: the README completion contract (specified): a scale whose setup fails
  // cannot finish; the failed setup sample is retained with its count.
  it('stops when the repository cannot be created', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'cone-scale-setup-'));
    try {
      const traces = traceConfiguration(scratch);
      writeFileSync(join(scratch, 'occupied'), '');
      const output = new ConeShowcaseReportOutput();
      const run = runScale(join(scratch, 'occupied', 'repo'), 1, new GitProcessCounter(traces), new WitnessReport(1, output));
      await expect(run).rejects.toThrow('repository setup did not complete');
      expect(output.lines[0]?.split('\t').slice(0, 9)).toEqual(['sample', '1', '0', 'setup', 'init-repository', '', '', '1', 'error']);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('stops when setup does not observe the three real Git setup processes', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'cone-scale-calibration-'));
    try {
      const traces = join(scratch, 'traces');
      mkdirSync(traces);
      const emptyConfig = join(scratch, 'empty-gitconfig');
      writeFileSync(emptyConfig, '');
      vi.stubEnv('GIT_CONFIG_GLOBAL', emptyConfig);
      const output = new ConeShowcaseReportOutput();
      const run = runScale(join(scratch, 'repo'), 1, new GitProcessCounter(traces), new WitnessReport(1, output));
      await expect(run).rejects.toThrow('trace calibration did not observe the three real Git setup invocations');
      expect(output.lines).toEqual(['sample\t1\t0\tsetup\tinit-repository\t\t\t0\tcompleted\t', 'sample-end\t0']);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  // Oracle: the README "What the witness asserts today" (specified): every write is
  // retained and every planned sample has an actual count, but Lane.observe refuses
  // a Warp-written lane, so all 35 reads are unchecked and the scale is incomplete.
  // #1052 must change this case to verified reads and a complete scale.
  it('counts every planned sample of a one-thread run, and reports its refused reads', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'cone-scale-run-'));
    try {
      const traces = traceConfiguration(scratch);
      const output = new ConeShowcaseReportOutput();
      const bulk = expectedBulkPatches(new MarginCorpus(1), 1);

      const result = await runScale(join(scratch, 'repo'), 1, new GitProcessCounter(traces), new WitnessReport(1, output));

      const phases = result.samples.map((sample) => sample.phase);
      const count = (phase: string): number => phases.filter((each) => each === phase).length;
      expect([count('setup'), count('bulk'), count('save'), count('close'), count('margins'), count('cold')])
        .toEqual([4, bulk, MEASURED_SAVES, 2, MARGINS_READS, COLD_OPENS]);
      expect(result.samples.map((sample) => sample.sequence)).toEqual(phases.map((_phase, index) => index));
      expect(result.samples.every((sample) => sample.count !== null)).toBe(true);
      expect(result.samples[0]?.count?.total).toBe(3);
      expect(result.samples.filter((sample) => sample.phase === 'bulk' || sample.phase === 'save')
        .every((sample) => sample.outcome.status === 'retained' && (sample.count?.total ?? 0) > 0)).toBe(true);
      expect(result.samples.filter((sample) => sample.phase === 'setup' || sample.phase === 'close')
        .every((sample) => sample.outcome.status === 'completed')).toBe(true);
      expect(new Set(result.samples.filter((sample) => sample.phase === 'margins' || sample.phase === 'cold')
        .map((sample) => sample.outcome.detail))).toEqual(new Set(['obstructed: missing_bounded_basis']));
      expect(result.isComplete()).toBe(false);
      expect(result.summary().split('\n').slice(-3)).toEqual([
        'read-check\t1\tunchecked\t0/35\tobstructed%3A%20missing_bounded_basis=35', 'scale-end\t1\tincomplete', '',
      ]);
      expect(output.lines.filter((line) => line.startsWith('sample-end\t'))).toHaveLength(result.samples.length);
      expect(readdirSync(traces)).toEqual([]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, RUN_TIMEOUT_MS);
});
