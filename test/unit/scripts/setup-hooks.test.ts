import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';

const installer = fileURLToPath(new URL('../../../scripts/setup-hooks.ts', import.meta.url));
let directory: string;
let primary: string;
let linked: string;

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
  writeFileSync(join(cwd, 'package.json'), `{
    "name": "hook-lifecycle-fixture", "version": "1.0.0", "type": "module",
    "scripts": { "prepare": "node scripts/setup-hooks.ts" }
  }`);
}

function install(cwd: string): void {
  execFileSync(process.execPath, [join(cwd, 'scripts/setup-hooks.ts')], { cwd, stdio: 'pipe' });
}

function expectOwnHooks(): void {
  for (const { checkout, marker } of [
    { checkout: primary, marker: 'primary' },
    { checkout: linked, marker: 'linked' },
  ]) {
    expect(git(checkout, 'config', '--local', '--get', 'core.hooksPath')).toBe('scripts/hooks');
    git(checkout, 'hook', 'run', 'pre-commit');
    expect(readFileSync(join(checkout, 'hook-marker'), 'utf8').trim()).toBe(marker);
  }
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'warp hook setup '));
  primary = join(directory, 'primary');
  linked = join(directory, 'linked');
  execFileSync('git', ['init', '--initial-branch=main', primary], { stdio: 'pipe' });
  git(primary, '-c', 'user.name=Hook test', '-c', 'user.email=hooks@example.invalid',
    'commit', '--allow-empty', '-m', 'Fixture');
  git(primary, 'worktree', 'add', '-b', 'linked', linked);
  installFixture(primary, 'primary');
  installFixture(linked, 'linked');
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

it('keeps each linked worktree on its own hooks after either installer runs', () => {
  for (const owner of [primary, linked]) {
    install(owner);
    expectOwnHooks();
  }
});

it('repairs a legacy absolute path belonging to either registered worktree', () => {
  for (const owner of [primary, linked]) {
    git(primary, 'config', '--local', 'core.hooksPath', join(owner, 'scripts/hooks'));
    install(linked);
    expectOwnHooks();
  }
});

it.each(['custom-hooks', ''])('preserves explicit local hook configuration %j', (configured) => {
  git(primary, 'config', '--local', 'core.hooksPath', configured);
  install(linked);
  expect(git(primary, 'config', '--local', '--get', 'core.hooksPath')).toBe(configured);
});

it('preserves an absolute custom hook directory', () => {
  const custom = join(directory, 'custom-hooks');
  git(primary, 'config', '--local', 'core.hooksPath', custom);
  install(linked);
  expect(git(primary, 'config', '--local', '--get', 'core.hooksPath')).toBe(custom);
});

it('preserves global hook configuration without adding a local override', () => {
  git(primary, 'config', '--file', join(directory, '.gitconfig'), 'core.hooksPath', 'global-hooks');
  execFileSync('env', [`HOME=${directory}`, process.execPath, 'scripts/setup-hooks.ts'],
    { cwd: linked, stdio: 'pipe' });
  expect(git(primary, 'config', '--local', '--list')).not.toContain('core.hookspath');
});

it('preserves worktree hook configuration without changing shared configuration', () => {
  git(primary, 'config', 'extensions.worktreeConfig', 'true');
  git(linked, 'config', '--worktree', 'core.hooksPath', 'worktree-hooks');
  install(linked);
  expect(git(linked, 'config', '--get', 'core.hooksPath')).toBe('worktree-hooks');
  expect(git(primary, 'config', '--local', '--list')).not.toContain('core.hookspath');
});

it('preserves command-scoped hook configuration without adding a local override', () => {
  git(linked, '-c', 'core.hooksPath=command-hooks', '-c',
    'alias.install-hooks=!node scripts/setup-hooks.ts', 'install-hooks');
  expect(git(primary, 'config', '--local', '--list')).not.toContain('core.hookspath');
});

it.each([
  ['run', 'prepare'],
  ['pack', '--dry-run', '--ignore-scripts'],
])('keeps hooks worktree-relative through npm %j', (...args) => {
  git(primary, 'config', '--local', 'core.hooksPath', join(primary, 'scripts/hooks'));
  execFileSync('npm', args, { cwd: linked, stdio: 'pipe' });
  expectOwnHooks();
});

it('preserves explicit configuration through npm pack prepare', () => {
  git(primary, 'config', '--local', 'core.hooksPath', 'custom-hooks');
  execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts'], { cwd: linked, stdio: 'pipe' });
  expect(git(primary, 'config', '--local', '--get', 'core.hooksPath')).toBe('custom-hooks');
});
