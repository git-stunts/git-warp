import { execFileSync, spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import GitProcessCounter, { TRACE_BYTE_LIMIT, TRACE_FILE_LIMIT } from '../../../benchmarks/cone-showcase/GitProcessCounter.ts';
import GitTraceReserve from '../../../benchmarks/cone-showcase/GitTraceReserve.ts';

const CALIBRATION = fileURLToPath(new URL('../../fixtures/coneShowcaseCounterCalibration.ts', import.meta.url));
const CHILD_TIMEOUT_MS = 15_000;
const CHILD_OUTPUT_BYTES = 65_536;
const TRACE_RECORD = '{"event":"exit","code":0}\n';

describe('cone-showcase Trace2 process metric', () => {
  it.each(['standard', 'missing-git'])('checks known real process outcomes: %s', (mode) => {
    const scratch = mkdtempSync(join(tmpdir(), 'cone-trace-calibration-'));
    let cleanupAllowed = false;
    try {
      const repository = join(scratch, 'repo');
      const traceDirectory = join(scratch, 'trace');
      const config = join(scratch, 'gitconfig');
      const emptyConfig = join(scratch, 'empty-gitconfig');
      const emptyPath = join(scratch, 'empty-path');
      mkdirSync(traceDirectory);
      mkdirSync(emptyPath);
      writeFileSync(config, '[trace2]\n\teventTarget = ' + traceDirectory + '\n');
      writeFileSync(emptyConfig, '');
      execFileSync('git', ['init', '--quiet', repository], { timeout: CHILD_TIMEOUT_MS, maxBuffer: CHILD_OUTPUT_BYTES });
      const blobOid = execFileSync('git', ['-C', repository, 'hash-object', '-w', '--stdin'], {
        input: 'cone calibration\n', encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, maxBuffer: CHILD_OUTPUT_BYTES,
      }).trim();
      const environment = ['GIT_CONFIG_GLOBAL=' + config, ...(mode === 'missing-git' ? ['PATH=' + emptyPath] : [])];
      const child = spawnSync('env', [...environment, process.execPath, CALIBRATION, repository, traceDirectory, blobOid, emptyConfig, mode], {
        encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, maxBuffer: CHILD_OUTPUT_BYTES,
      });
      cleanupAllowed = child.error === undefined && child.signal === null && child.status === 0;
      expect(child.error, 'calibration child invocation').toBeUndefined();
      expect(child.signal).toBeNull();
      expect(child.status, child.stderr).toBe(0);
      expect(child.stdout.endsWith('\n')).toBe(true);
      const rows = child.stdout.slice(0, -1).split('\n').map((line) => line.split('\t'));
      const expected = mode === 'missing-git' ? [['failedSpawn', '0']] : [
        ['executeStream', '1'], ['captureAgain', '0'], ['openSession', '1'], ['reuseSession', '0'], ['closeSession', '0'],
        ['sanitizerRefusal', '0'], ['nonzeroExit', '1'], ['nonGit', '0'], ['outsideScope', '0'], ['configuredDescendant', '2'], ['afterReset', '1'],
      ];
      expect(rows.map((row) => row.slice(0, 2))).toEqual(expected);
      for (const row of rows) {
        expect(row).toHaveLength(3);
        const files = row[2] === '' ? [] : row[2]?.split(',');
        expect(files?.length).toBe(Number(row[1]));
      }
    } finally {
      // Abnormal child termination leaves its trace writers to the outer worker.
      if (cleanupAllowed) rmSync(scratch, { recursive: true, force: true });
    }
  });

  it.each(['missing', 'directory', 'symlink', 'empty', 'truncated'])(
    'refuses damaged or exhausted trace evidence: %s', (fault) => {
      const scratch = mkdtempSync(join(tmpdir(), 'cone-trace-fault-'));
      try {
        const traces = join(scratch, 'trace');
        if (fault !== 'missing') mkdirSync(traces);
        if (fault === 'directory') mkdirSync(join(traces, 'unexpected'));
        if (fault === 'symlink') symlinkSync('../outside', join(traces, 'unexpected'));
        if (fault === 'empty') writeFileSync(join(traces, 'partial'), '');
        if (fault === 'truncated') writeFileSync(join(traces, 'partial'), '{');
        expect(() => new GitProcessCounter(traces).capture()).toThrow();
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    },
  );

  it('stops at the discard guard with its own error', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'cone-trace-guard-'));
    try {
      const traces = join(scratch, 'trace');
      mkdirSync(traces);
      // Git writes the tripping process's events into the sentinel, so it is a nonempty, complete record.
      writeFileSync(join(traces, 'git-trace2-discard'), TRACE_RECORD);
      expect(() => new GitProcessCounter(traces).capture()).toThrow(
        new TypeError('Git trace contains a discarded or nonregular result'),
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('admits exact byte capacity and refuses one byte beyond it', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'cone-trace-byte-reserve-'));
    try {
      writeFileSync(join(scratch, 'first'), TRACE_RECORD);
      writeFileSync(join(scratch, 'second'), TRACE_RECORD);
      const first = lstatSync(join(scratch, 'first'));
      const second = lstatSync(join(scratch, 'second'));
      const occupied = Math.max(first.size, first.blocks * 512) + Math.max(second.size, second.blocks * 512);
      const exact = new GitTraceReserve({ bytes: occupied, files: 2 });
      const exceeded = new GitTraceReserve({ bytes: occupied - 1, files: 2 });

      expect(new GitProcessCounter(scratch, exact).capture().total).toBe(2);
      expect(() => new GitProcessCounter(scratch, exceeded).capture()).toThrow(
        new RangeError('Git trace byte reserve exhausted; sample is incomplete'),
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('admits exact file capacity and refuses one file beyond it', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'cone-trace-file-reserve-'));
    try {
      const reserve = new GitTraceReserve({ bytes: TRACE_BYTE_LIMIT, files: 2 });
      const counter = new GitProcessCounter(scratch, reserve);
      writeFileSync(join(scratch, 'first'), TRACE_RECORD);
      writeFileSync(join(scratch, 'second'), TRACE_RECORD);
      expect(counter.capture().total).toBe(2);

      writeFileSync(join(scratch, 'third'), TRACE_RECORD);
      expect(() => counter.capture()).toThrow(
        new RangeError('Git trace file reserve exhausted; sample is incomplete'),
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('keeps the production reserve at 568 MiB and 72,704 files', () => {
    const reserve = GitTraceReserve.production();
    expect(reserve.bytes).toBe(568 * 1024 * 1024);
    expect(reserve.files).toBe(72_704);
    expect(TRACE_BYTE_LIMIT).toBe(reserve.bytes);
    expect(TRACE_FILE_LIMIT).toBe(reserve.files);
    expect(Object.isFrozen(reserve)).toBe(true);
  });

  it('refuses an unvalidated reserve before counter work', () => {
    expect(() => new GitProcessCounter('', { bytes: 1, files: 1 })).toThrow(
      new TypeError('a Git trace counter needs a validated trace reserve'),
    );
  });

  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, TRACE_BYTE_LIMIT + 1])(
    'refuses invalid byte reserve %s before counter work', (bytes) => {
      expect(() => new GitProcessCounter('', new GitTraceReserve({ bytes, files: 1 }))).toThrow(
        new RangeError('Git trace byte reserve must be a positive safe integer at or below its production maximum'),
      );
    },
  );

  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, TRACE_FILE_LIMIT + 1])(
    'refuses invalid file reserve %s before counter work', (files) => {
      expect(() => new GitProcessCounter('', new GitTraceReserve({ bytes: 1, files }))).toThrow(
        new RangeError('Git trace file reserve must be a positive safe integer at or below its production maximum'),
      );
    },
  );

  it('refuses an unnamed directory, and a trace path that is not a directory', () => {
    expect(() => new GitProcessCounter('')).toThrow('a Git trace counter needs its owned directory');
    const scratch = mkdtempSync(join(tmpdir(), 'cone-trace-file-'));
    try {
      const traces = join(scratch, 'trace');
      writeFileSync(traces, TRACE_RECORD);
      expect(() => new GitProcessCounter(traces).capture()).toThrow('Git trace directory is missing or not a real directory');
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it.each(['removed', 'replaced'])('stops when a retained trace file is %s before cleanup', (fault) => {
    const scratch = mkdtempSync(join(tmpdir(), 'cone-trace-identity-'));
    try {
      const traces = join(scratch, 'trace');
      mkdirSync(traces);
      writeFileSync(join(traces, 'retained'), TRACE_RECORD);
      const counter = new GitProcessCounter(traces);
      expect(counter.capture().files).toEqual(['retained']);
      if (fault === 'removed') {
        unlinkSync(join(traces, 'retained'));
      } else {
        writeFileSync(join(traces, 'other'), TRACE_RECORD);
        renameSync(join(traces, 'other'), join(traces, 'retained'));
      }
      expect(() => counter.capture()).toThrow('a retained Git trace file disappeared or changed identity before lifecycle cleanup');
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  // Oracle: the README cleanup contract (specified): cleanup follows retained samples,
  // and never removes a trace identity that no sample retained.
  it('cleans up only retained traces, then counts the next lifecycle from empty', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'cone-trace-cleanup-'));
    try {
      const traces = join(scratch, 'trace');
      mkdirSync(traces);
      const counter = new GitProcessCounter(traces);
      writeFileSync(join(traces, 'first'), TRACE_RECORD);
      expect(counter.capture().files).toEqual(['first']);
      writeFileSync(join(traces, 'unretained'), TRACE_RECORD);
      expect(() => counter.cleanupAfterWritersClosed()).toThrow('Git trace cleanup refused unretained process identities');
      expect(readdirSync(traces).sort()).toEqual(['first', 'unretained']);
      expect(counter.capture().files).toEqual(['unretained']);
      counter.cleanupAfterWritersClosed();
      expect(readdirSync(traces)).toEqual([]);
      writeFileSync(join(traces, 'first'), TRACE_RECORD);
      expect(counter.capture().files).toEqual(['first']);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
