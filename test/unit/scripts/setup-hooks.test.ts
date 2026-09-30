import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const installer = fileURLToPath(new URL('../../../scripts/setup-hooks.ts', import.meta.url));

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

function installFixture(cwd: string, marker: string): void {
  const scripts = join(cwd, 'scripts');
  const hooks = join(scripts, 'hooks');
  mkdirSync(hooks, { recursive: true });
  copyFileSync(installer, join(scripts, 'setup-hooks.ts'));
  const hook = join(hooks, 'pre-commit');
  writeFileSync(hook, `#!/bin/sh\nprintf '${marker}\\n' > hook-marker\n`);
  chmodSync(hook, 0o755);
}

it('keeps each linked worktree on its own hooks after either installer runs', () => {
  const directory = mkdtempSync(join(tmpdir(), 'warp hook setup '));
  const primary = join(directory, 'primary');
  const linked = join(directory, 'linked');
  try {
    execFileSync('git', ['init', '--initial-branch=main', primary], { stdio: 'pipe' });
    git(primary, '-c', 'user.name=Hook test', '-c', 'user.email=hooks@example.invalid',
      'commit', '--allow-empty', '-m', 'Fixture');
    git(primary, 'worktree', 'add', '-b', 'linked', linked);
    installFixture(primary, 'primary');
    installFixture(linked, 'linked');

    for (const owner of [primary, linked]) {
      execFileSync(process.execPath, ['--experimental-strip-types', join(owner, 'scripts/setup-hooks.ts')],
        { cwd: owner, stdio: 'pipe' });
      for (const { checkout, marker } of [
        { checkout: primary, marker: 'primary' },
        { checkout: linked, marker: 'linked' },
      ]) {
        expect(git(checkout, 'config', '--local', '--get', 'core.hooksPath')).toBe('scripts/hooks');
        git(checkout, 'hook', 'run', 'pre-commit');
        expect(readFileSync(join(checkout, 'hook-marker'), 'utf8').trim())
          .toBe(marker);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
