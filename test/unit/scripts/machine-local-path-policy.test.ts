import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import packageJson from '../../../package.json' with { type: 'json' };
import { MachineLocalPathPolicy } from '../../../scripts/MachineLocalPathPolicy.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function posixPath(...segments: readonly string[]): string {
  return ['', ...segments].join('/');
}

function windowsPath(...segments: readonly string[]): string {
  return ['C:', ...segments].join('\\');
}

describe('machine-local path policy', () => {
  it('runs the tracked-file guard in the ordinary lint gate', () => {
    expect(packageJson.scripts['lint:machine-paths']).toBe(
      'node scripts/check-machine-local-paths.ts'
    );
    expect(packageJson.scripts.lint).toContain('npm run lint:machine-paths');
  });

  it('recognizes personal homes and Darwin temporary roots', () => {
    const policy = new MachineLocalPathPolicy();

    expect(policy.containsMachineLocalPath(posixPath('Users', 'example', 'git', 'project'))).toBe(
      true
    );
    expect(policy.containsMachineLocalPath(posixPath('home', 'example', 'git', 'project'))).toBe(
      true
    );
    expect(policy.containsMachineLocalPath(windowsPath('Users', 'example', 'git', 'project'))).toBe(
      true
    );
    expect(policy.containsMachineLocalPath(windowsPath('users', 'example', 'git', 'project'))).toBe(
      true
    );
    expect(
      policy.containsMachineLocalPath(posixPath('private', 'var', 'folders', 'xy', 'session'))
    ).toBe(true);
  });

  it('allows portable and system-owned paths', () => {
    const policy = new MachineLocalPathPolicy();

    expect(policy.containsMachineLocalPath('~/git/project')).toBe(false);
    expect(policy.containsMachineLocalPath('$HOME/git/project')).toBe(false);
    expect(policy.containsMachineLocalPath('<HOME>/git/project')).toBe(false);
    expect(policy.containsMachineLocalPath('/usr/local/bin/tool')).toBe(false);
    expect(policy.containsMachineLocalPath('/tmp/project')).toBe(false);
  });

  it('passes the current tracked and unignored repository inventory', () => {
    expect(() =>
      execFileSync(process.execPath, [join(ROOT, 'scripts/check-machine-local-paths.ts')], {
        cwd: ROOT,
        stdio: 'pipe',
      })
    ).not.toThrow();
  });
});
