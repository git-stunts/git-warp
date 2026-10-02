import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import packageJson from '../../../package.json' with { type: 'json' };

const fixtures: string[] = [];
afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function run(command: string, args: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'warp manual performance '));
  fixtures.push(root);
  mkdirSync(join(root, 'scripts'));
  if (existsSync('scripts/RunDockerPerformance.sh'))
    copyFileSync(resolve('scripts/RunDockerPerformance.sh'), join(root, 'scripts/RunDockerPerformance.sh'));
  writeFileSync(join(root, 'scripts/run-in-docker.sh'), `#!/usr/bin/env bash
printf '%s\\0' "$@" > "$TRACE"
exit 7
`);
  const result = spawnSync('sh', ['-c', `${command} "$@"`, '--', ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, TRACE: join(root, 'trace'),
      GIT_WARP_PERF_RUNS: '1', GIT_WARP_PERF_WARMUPS: '0' },
  });
  return { result, args: existsSync(join(root, 'trace'))
    ? readFileSync(join(root, 'trace'), 'utf8').split('\0').filter(Boolean) : [] };
}

describe('manual performance Docker boundary', () => {
  it.each([
    { name: 'measure', command: packageJson.scripts['performance:measure'] },
    { name: 'streaming', command: packageJson.scripts['performance:streaming'] },
    { name: 'migrated-read', command: packageJson.scripts['performance:migrated-read'] },
  ])('exports the selected $name report and copies source identity', ({ command }) => {
    const actual = run(command, ['--output', '.performance/report with spaces.json']);
    expect(actual.result.status).toBe(7);
    expect(actual.args).toContain('--source-history');
    const index = actual.args.indexOf('--export-file');
    expect(index).toBeGreaterThanOrEqual(0);
    expect(actual.args[index + 1]).toBe('.performance/report with spaces.json');
    expect(actual.args).toContain('GIT_WARP_PERF_RUNS=1');
    expect(actual.args).toContain('GIT_WARP_PERF_WARMUPS=0');
  });

  it('exports a failing performance gate summary', () => {
    const actual = run(packageJson.scripts['performance:gate'], [
      '--head', '.performance/head.json', '--summary', '.performance/summary.md',
    ]);
    expect(actual.result.status).toBe(7);
    const index = actual.args.indexOf('--export-file');
    expect(index).toBeGreaterThanOrEqual(0);
    expect(actual.args[index + 1]).toBe('.performance/summary.md');
  });

  it('copies an explicitly selected gate input from the ignored ratchet directory', () => {
    const actual = run(packageJson.scripts['performance:gate'], [
      '--head', '.ratchet/report.json', '--summary', '.performance/summary.md',
    ]);
    expect(actual.result.status).toBe(7);
    const index = actual.args.indexOf('--import-file');
    expect(index).toBeGreaterThanOrEqual(0);
    expect(actual.args[index + 1]).toBe('.ratchet/report.json');
  });
});
