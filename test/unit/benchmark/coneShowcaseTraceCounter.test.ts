import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import GitProcessCounter, { TRACE_BYTE_LIMIT, TRACE_FILE_LIMIT } from '../../../benchmarks/cone-showcase/GitProcessCounter.ts';

const CALIBRATION = fileURLToPath(new URL('../../fixtures/coneShowcaseCounterCalibration.ts', import.meta.url));
const CHILD_TIMEOUT_MS = 15_000;
const CHILD_OUTPUT_BYTES = 65_536;

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

  it.each(['missing', 'directory', 'symlink', 'discard', 'empty', 'truncated', 'byte-reserve', 'inode-reserve'])(
    'refuses damaged or exhausted trace evidence: %s', (fault) => {
      const scratch = mkdtempSync(join(tmpdir(), 'cone-trace-fault-'));
      try {
        const traces = join(scratch, 'trace');
        if (fault !== 'missing') mkdirSync(traces);
        if (fault === 'directory') mkdirSync(join(traces, 'unexpected'));
        if (fault === 'symlink') symlinkSync('../outside', join(traces, 'unexpected'));
        if (fault === 'discard') writeFileSync(join(traces, 'git-trace2-discard'), '');
        if (fault === 'empty') writeFileSync(join(traces, 'partial'), '');
        if (fault === 'truncated') writeFileSync(join(traces, 'partial'), '{');
        if (fault === 'byte-reserve') {
          const partial = join(traces, 'oversized');
          writeFileSync(partial, '\n');
          truncateSync(partial, TRACE_BYTE_LIMIT + 1);
        }
        if (fault === 'inode-reserve') {
          for (let index = 0; index <= TRACE_FILE_LIMIT; index += 1) {
            writeFileSync(join(traces, String(index)), '');
          }
        }
        expect(() => new GitProcessCounter(traces).capture()).toThrow();
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    },
  );
});
