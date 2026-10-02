import { execFileSync, spawnSync } from 'node:child_process';
import { delimiter, dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Calibrate host refusal inside Docker: hide only container evidence from
// the child, leaving the real host filesystem completely untouched.
const HIDE_CONTAINER_MARKER = `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const exists = fs.existsSync;
fs.existsSync = (path) => path === '/.dockerenv' ? false : exists(path);
syncBuiltinESMExports();
`;
const PRELOAD = `data:text/javascript,${encodeURIComponent(HIDE_CONTAINER_MARKER)}`;

describe('Docker test isolation', () => {
  it('resolves a direct package command without npm adding its binary directory', () => {
    const shell = execFileSync('sh', ['-c', 'command -v bash'], { encoding: 'utf8' }).trim();
    const result = spawnSync(shell, ['scripts/run-in-docker.sh', 'vitest', '--version'], {
      encoding: 'utf8',
      env: { PATH: [dirname(process.execPath), dirname(shell)].join(delimiter) },
    });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/vitest\/\d+/u);
  });

  it('accepts actual container evidence without environment flags', () => {
    const result = spawnSync(process.execPath, ['scripts/RequireDockerTests.ts'], {
      encoding: 'utf8',
      env: {},
    });
    expect(result.status).toBe(0);
  });

  it('rejects a simulated host even with Docker and GitHub Actions flags', () => {
    const result = spawnSync(process.execPath, [
      '--import', PRELOAD, 'scripts/RequireDockerTests.ts',
    ], {
      encoding: 'utf8',
      env: { GIT_STUNTS_DOCKER: '1', GITHUB_ACTIONS: 'true' },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('HOST EXECUTION PROHIBITED');
  });

  it('refuses direct Vitest before loading any test file on a simulated host', () => {
    const result = spawnSync(process.execPath, [
      resolve('node_modules/vitest/vitest.mjs'),
      'run', 'test/unit/domain/services/SyncSecret.test.ts',
    ], {
      encoding: 'utf8',
      env: {
        NODE_OPTIONS: `--import=${PRELOAD}`,
        GIT_STUNTS_DOCKER: '1',
        GITHUB_ACTIONS: 'true',
      },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('HOST EXECUTION PROHIBITED');
    expect(result.stdout).not.toContain('Test Files');
  });
});
