import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SourceAllowanceHistory from '../../../scripts/source-reachability/SourceAllowanceHistory.ts';
import { UNREACHABLE_SOURCE_ALLOWLIST_PATH } from '../../../scripts/source-reachability/parseSourceAllowances.ts';

const GIT_TIMEOUT_MS = 10_000;
const EXISTING = '#814\tsrc/existing.ts\n';
const ADDED = '#1052\tsrc/added.ts\n';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function inventory(root: string, content: string): void {
  write(root, UNREACHABLE_SOURCE_ALLOWLIST_PATH, content);
}

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Allowance fixture', '-c', 'user.email=fixture@example.invalid', ...args], {
    cwd: root, encoding: 'utf8', timeout: GIT_TIMEOUT_MS, stdio: 'pipe',
  }).trim();
}

function checkpoint(root: string, message: string): string {
  git(root, 'add', '.');
  git(root, 'commit', '--allow-empty', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

function fixture(rows: string | null): string {
  const root = mkdtempSync(join(tmpdir(), 'source-allowance-'));
  roots.push(root);
  mkdirSync(join(root, 'src'));
  write(root, 'package.json', '{"type":"module","exports":{".":{"types":"./dist/index.d.ts","import":"./dist/index.js","default":"./dist/index.js"}},"bin":{}}\n');
  write(root, 'index.ts', 'export {};\n');
  if (rows !== null) inventory(root, rows);
  git(root, 'init', '-b', 'main');
  checkpoint(root, 'accepted basis');
  git(root, 'switch', '-c', 'candidate');
  return root;
}

describe('source allowance history admission', () => {
  // Oracle: #1054 permits only a subset of the accepted owner/path rows.
  it.each([EXISTING + ADDED, EXISTING, ADDED, ''])('permits an unchanged inventory or subset %j', (rows) => {
    const root = fixture(EXISTING + ADDED);
    inventory(root, rows);
    expect(new SourceAllowanceHistory(root).check('main')).toEqual([]);
  });

  it('rejects growth committed before an unrelated followup', () => {
    const root = fixture(EXISTING);
    inventory(root, EXISTING + ADDED);
    checkpoint(root, 'grow');
    checkpoint(root, 'unrelated followup');
    expect(new SourceAllowanceHistory(root).check('main')).toEqual(['NEW allowance #1052\tsrc/added.ts']);
  });

  it('rejects a same-count replacement', () => {
    const root = fixture(EXISTING);
    inventory(root, ADDED);
    expect(new SourceAllowanceHistory(root).check('main')).toEqual(['NEW allowance #1052\tsrc/added.ts']);
  });

  it('rejects an owner change without an accepted new basis', () => {
    const root = fixture(EXISTING);
    inventory(root, '#1052\tsrc/existing.ts\n');
    expect(new SourceAllowanceHistory(root).check('main')).toEqual(['NEW allowance #1052\tsrc/existing.ts']);
  });

  it('rejects reintroduction after retirement on main', () => {
    const root = fixture(EXISTING);
    git(root, 'switch', 'main');
    inventory(root, '');
    checkpoint(root, 'retire');
    git(root, 'switch', '-c', 'later');
    inventory(root, EXISTING);
    expect(new SourceAllowanceHistory(root).check('main')).toEqual(['NEW allowance #814\tsrc/existing.ts']);
  });

  it('uses the pinned inventory for the first introduction', () => {
    const root = fixture(null);
    inventory(root, EXISTING);
    const initial = checkpoint(root, 'approved introduction');
    expect(new SourceAllowanceHistory(root, initial).check('main')).toEqual([]);
  });

  it('rejects growth beyond the pinned initial inventory', () => {
    const root = fixture(null);
    inventory(root, EXISTING);
    const initial = checkpoint(root, 'approved introduction');
    inventory(root, EXISTING + ADDED);
    expect(new SourceAllowanceHistory(root, initial).check('main')).toEqual(['NEW allowance #1052\tsrc/added.ts']);
  });

  it('rejects a reset after the inventory was deleted', () => {
    const root = fixture(EXISTING);
    git(root, 'switch', 'main');
    git(root, 'rm', '--', UNREACHABLE_SOURCE_ALLOWLIST_PATH);
    checkpoint(root, 'delete inventory');
    git(root, 'switch', '-c', 'later');
    inventory(root, ADDED);
    expect(new SourceAllowanceHistory(root).check('main')).toEqual(['An earlier source allowance inventory or guard prevents reset']);
  });

  it('refuses a non-immutable initial reference', () => {
    const root = fixture(null);
    inventory(root, EXISTING);
    expect(new SourceAllowanceHistory(root, 'HEAD').check('main')).toEqual(['An immutable initial source allowance commit is required']);
  });

  it('refuses an initial commit outside the candidate history', () => {
    const root = fixture(null);
    git(root, 'switch', 'main');
    inventory(root, EXISTING);
    const other = checkpoint(root, 'unrelated introduction');
    git(root, 'switch', 'candidate');
    inventory(root, EXISTING);
    expect(new SourceAllowanceHistory(root, other).check('HEAD')).toEqual(['Source allowance history inspection failed: merge-base']);
  });

  it('refuses a pinned commit without the initial inventory', () => {
    const root = fixture(null);
    const initial = git(root, 'rev-parse', 'HEAD');
    inventory(root, EXISTING);
    expect(new SourceAllowanceHistory(root, initial).check('main')).toEqual(['Source allowance history inspection failed: show']);
  });

  it('refuses a missing current inventory', () => {
    const root = fixture(null);
    expect(new SourceAllowanceHistory(root).check('main')).toEqual(['Current source allowance inventory is missing']);
  });

  it('refuses malformed current rows', () => {
    const root = fixture(EXISTING);
    inventory(root, 'src/ownerless.ts\n');
    expect(new SourceAllowanceHistory(root).check('main')).toEqual(['MALFORMED allowance: src/ownerless.ts']);
  });

  it('refuses malformed historical rows', () => {
    const root = fixture('src/ownerless.ts\n');
    inventory(root, EXISTING);
    expect(new SourceAllowanceHistory(root).check('main')).toEqual(['History: MALFORMED allowance: src/ownerless.ts']);
  });

  it('refuses a missing comparison reference', () => {
    const root = fixture(EXISTING);
    expect(new SourceAllowanceHistory(root).check('missing')).toEqual(['Source allowance history inspection failed: merge-base']);
  });

  it('refuses a directory without Git history', () => {
    const root = mkdtempSync(join(tmpdir(), 'source-allowance-unversioned-'));
    roots.push(root);
    inventory(root, EXISTING);
    expect(new SourceAllowanceHistory(root).check('main')).toEqual(['Source allowance history inspection failed: rev-parse']);
  });

  it('refuses shallow history', () => {
    const root = fixture(EXISTING);
    const parent = mkdtempSync(join(tmpdir(), 'source-allowance-shallow-'));
    roots.push(parent);
    const clone = join(parent, 'clone');
    git(root, 'clone', '--depth', '1', pathToFileURL(root).href, clone);
    expect(new SourceAllowanceHistory(clone).check('HEAD')).toEqual(['Complete history is required for source allowances']);
  });

  it('refuses multiple merge bases', () => {
    const root = fixture(EXISTING);
    write(root, 'left.txt', 'left\n');
    checkpoint(root, 'left');
    git(root, 'branch', 'original-left');
    git(root, 'switch', '-c', 'right', 'main');
    write(root, 'right.txt', 'right\n');
    checkpoint(root, 'right');
    git(root, 'branch', 'original-right');
    git(root, 'switch', 'candidate');
    git(root, 'merge', '--no-ff', '-m', 'left merge', 'original-right');
    git(root, 'switch', 'right');
    git(root, 'merge', '--no-ff', '-m', 'right merge', 'original-left');
    expect(new SourceAllowanceHistory(root).check('candidate')).toEqual(['One unambiguous merge base is required for source allowances']);
  });

  it('passes the CI entry point for an unchanged inventory', async () => {
    const root = fixture('');
    git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    const entry = fileURLToPath(new URL('../../../scripts/source-reachability/check-source-history.ts', import.meta.url));
    const result = spawnSync(process.execPath, [entry], { cwd: root, encoding: 'utf8', timeout: GIT_TIMEOUT_MS });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Source allowance inventory did not grow from its accepted basis.');
    const originalDirectory = process.cwd();
    const originalExitCode = process.exitCode;
    try {
      process.chdir(root);
      process.exitCode = 0;
      vi.resetModules();
      await import('../../../scripts/source-reachability/check-source-history.ts');
      expect(process.exitCode).toBe(0);
    } finally {
      process.chdir(originalDirectory);
      process.exitCode = originalExitCode;
    }
  });

  it('refuses owner-row growth through the CI entry point', async () => {
    const root = fixture('');
    git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    inventory(root, ADDED);
    write(root, 'src/added.ts', 'export {};\n');
    const entry = fileURLToPath(new URL('../../../scripts/source-reachability/check-source-history.ts', import.meta.url));
    const result = spawnSync(process.execPath, [entry], { cwd: root, encoding: 'utf8', timeout: GIT_TIMEOUT_MS });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('NEW allowance #1052\tsrc/added.ts');
    const originalDirectory = process.cwd();
    const originalExitCode = process.exitCode;
    try {
      process.chdir(root);
      process.exitCode = 0;
      vi.resetModules();
      await import('../../../scripts/source-reachability/check-source-history.ts');
      expect(process.exitCode).toBe(1);
    } finally {
      process.chdir(originalDirectory);
      process.exitCode = originalExitCode;
    }
  });
});
