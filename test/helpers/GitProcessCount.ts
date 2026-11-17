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

/** The Git processes `run` starts. */
export async function gitProcesses(run: () => Promise<void>): Promise<number> {
  const shim = mkdtempSync(join(tmpdir(), 'git-process-count-'));
  try {
    const starts = join(shim, 'starts');
    const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
    writeFileSync(join(shim, 'git'), `#!/bin/sh\nprintf . >>'${starts}'\nexec '${realGit}' "$@"\n`);
    chmodSync(join(shim, 'git'), 0o755);
    await withEnvironment({ PATH: `${shim}:${process.env['PATH'] ?? ''}` }, run);
    return existsSync(starts) ? readFileSync(starts, 'utf8').length : 0;
  } finally {
    rmSync(shim, { recursive: true, force: true });
  }
}
