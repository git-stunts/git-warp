import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Fixture cost as a count of Git processes, not time (#1197): a bound on processes holds on
 * any runner, where a bound on seconds depends on its load. Every Git process this test
 * process starts, through the plumbing or directly, finds Git on PATH, so a `git` placed
 * first on PATH that records each start and then runs the real Git counts them all.
 */

/** Runs `run` with `variables` set in this process's environment, which Git child processes inherit. */
export async function withEnvironment(variables: Readonly<Record<string, string>>, run: () => Promise<void>): Promise<void> {
  const before = Object.keys(variables).map((name) => [name, process.env[name]] as const);
  Object.assign(process.env, variables);
  try {
    await run();
  } finally {
    for (const [name, value] of before) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

/**
 * The Git processes `run` starts. Every caller measures work that must start Git, so a count
 * of 0 means the counter is blind (Git ran without finding it on PATH), not that the work was
 * free: that throws instead of returning a count that would pass any upper bound.
 */
export async function gitProcesses(run: () => Promise<void>): Promise<number> {
  const shim = mkdtempSync(join(tmpdir(), 'git-process-count-'));
  try {
    const starts = join(shim, 'starts');
    const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
    writeFileSync(join(shim, 'git'), `#!/bin/sh\nprintf . >>'${starts}'\nexec '${realGit}' "$@"\n`);
    chmodSync(join(shim, 'git'), 0o755);
    await withEnvironment({ PATH: `${shim}:${process.env['PATH'] ?? ''}` }, run);
    const counted = existsSync(starts) ? readFileSync(starts, 'utf8').length : 0;
    if (counted === 0) {
      throw new Error('The Git process counter saw no Git process start; Git ran without finding the counter on PATH, so the count measures nothing');
    }
    return counted;
  } finally {
    rmSync(shim, { recursive: true, force: true });
  }
}
