import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';

import { describe, expect, it } from 'vitest';

import parseColdOpenResult from '../../../benchmarks/cone-showcase/ColdOpenResultParser.ts';
import MarginsUnavailable from '../../../benchmarks/cone-showcase/MarginsUnavailable.ts';

const CLI = fileURLToPath(new URL('../../../benchmarks/cone-showcase/ConeShowcaseWitness.ts', import.meta.url));
const CHILD_TIMEOUT_MS = 15_000;
const CHILD_OUTPUT_BYTES = 65_536;

describe('cone-showcase cold child transport', () => {
  it.each([
    ['negative process count', '-1 completed 1'],
    ['missing content field', '3 completed'],
    ['missing thread membership', '3 completed 1'],
    ['impossible completed thread count', '3 completed -1'],
    ['extra fields', '3 completed 1 extra'],
    ['unrecognised outcome', '3 not-a-read-outcome 1'],
    ['multiple child records', '3 completed 1\n3 completed 1'],
    ['empty child output', ''],
  ])('rejects %s instead of recording a successful sample', (_description, output) => {
    expect(() => parseColdOpenResult(output, 'd0')).toThrow();
  });

  it('rejects a process count that is not numeric', () => {
    expect(() => parseColdOpenResult('invalid completed 1', 'd0')).toThrow(TypeError);
  });

  it('does not turn a refused read into a completed read', () => {
    expect(parseColdOpenResult('cone-margins-v1\tincomplete\td0\nreason\tobserver\trefused\tno-page\nend\td0\t0\t0\n', 'd0')).toBeInstanceOf(MarginsUnavailable);
  });
});

describe('cone-showcase command line', () => {
  it.each(['--not-a-witness-option', '0', '2.5'])('rejects %s before any Git process starts', (argument) => {
    const scratch = mkdtempSync(join(tmpdir(), 'cone-cli-red-'));
    try {
      const traceDirectory = join(scratch, 'trace');
      const config = join(scratch, 'gitconfig');
      mkdirSync(traceDirectory);
      writeFileSync(config, '[trace2]\n\teventTarget = ' + traceDirectory + '\n');
      const child = spawnSync('env', ['GIT_CONFIG_GLOBAL=' + config, process.execPath, CLI, argument], {
        encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, maxBuffer: CHILD_OUTPUT_BYTES,
      });
      const traceFiles = readdirSync(traceDirectory);
      const diagnostic = {
        argument,
        status: child.status,
        signal: child.signal,
        invocationError: child.error,
        stdout: child.stdout,
        stderr: child.stderr,
        traceFileCount: traceFiles.length,
        traceFiles,
      };
      process.stdout.write(inspect(diagnostic, {
        colors: false, compact: false, depth: 3, maxArrayLength: null, maxStringLength: null,
      }) + '\n');
      expect(child.error, 'child invocation must complete before checking CLI behavior').toBeUndefined();
      expect(child.signal, 'child must not be killed by the run bound').toBeNull();
      expect(child.status).toBe(2);
      expect(child.stdout).toBe('');
      expect(child.stderr).toContain('Usage:');
      expect(traceFiles, 'invalid input must not create a repository').toEqual([]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
