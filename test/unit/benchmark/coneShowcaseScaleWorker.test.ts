import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Oracle: the README completion contract (specified): a scale that cannot count
// its own setup, or loses a count, ends with `scale-error`, no `scale-end`, and status 1.
const WORKER = fileURLToPath(new URL('../../../benchmarks/cone-showcase/ScaleWorker.ts', import.meta.url));
const CHILD_TIMEOUT_MS = 60_000;
const CHILD_OUTPUT_BYTES = 1024 * 1024;

function runWorker(traceDirectory: (scratch: string) => string): { readonly status: number | null; readonly lines: readonly string[] } {
  const scratch = mkdtempSync(join(tmpdir(), 'cone-worker-'));
  try {
    const emptyConfig = join(scratch, 'empty-gitconfig');
    writeFileSync(emptyConfig, '');
    // No trace2 configuration reaches Git, so the three setup Git processes leave no trace.
    const child = spawnSync('env', [
      'GIT_CONFIG_GLOBAL=' + emptyConfig, process.execPath, WORKER, join(scratch, 'repo'), '200', traceDirectory(scratch),
    ], { encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, maxBuffer: CHILD_OUTPUT_BYTES });
    expect(child.error, 'worker invocation').toBeUndefined();
    expect(child.signal).toBeNull();
    return { status: child.status, lines: child.stdout.split('\n') };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

describe('cone-showcase scale worker stops', () => {
  it('fails the run when setup does not observe exactly the three real Git setup processes', () => {
    const { status, lines } = runWorker((scratch) => {
      const traces = join(scratch, 'traces');
      mkdirSync(traces);
      return traces;
    });
    expect(status).toBe(1);
    expect(lines).toContain('sample\t200\t0\tsetup\tinit-repository\t\t\t0\tcompleted\t');
    expect(lines.at(-2)).toBe('scale-error\t200\t' + encodeURIComponent('trace calibration did not observe the three real Git setup invocations'));
    expect(lines.some((line) => line.startsWith('scale-end'))).toBe(false);
  }, CHILD_TIMEOUT_MS + 5_000);

  it('fails the run at the first sample whose count is missing', () => {
    const { status, lines } = runWorker((scratch) => join(scratch, 'no-trace-directory'));
    expect(status).toBe(1);
    const missingCount = 'sample\t200\t0\tsetup\tinit-repository\t\t\t-\terror\t'
      + encodeURIComponent('trace incomplete: ENOENT: no such file or directory');
    expect(lines[0]?.slice(0, missingCount.length)).toBe(missingCount);
    expect(lines.at(-2)).toBe('scale-error\t200\t' + encodeURIComponent('trace observation is incomplete; stop before another operation'));
    expect(lines.some((line) => line.startsWith('scale-end'))).toBe(false);
  }, CHILD_TIMEOUT_MS + 5_000);
});
