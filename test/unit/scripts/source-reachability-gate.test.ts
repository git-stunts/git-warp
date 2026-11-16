import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkSourceReachability, UNREACHABLE_SOURCE_ALLOWLIST_PATH } from '../../../scripts/source-reachability/SourceReachabilityGate.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

/** A package whose root reaches src/used.ts through a value import and src/shape.ts through a type import. */
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'source-reachability-'));
  roots.push(root);
  write(root, 'package.json', `{
    "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "default": "./dist/index.js" } },
    "bin": { "tool": "./dist/bin/tool.js" }
  }`);
  write(root, 'index.ts', "export { used } from './src/used.ts';\nexport type { Shape } from './src/shape.js';\n");
  write(root, 'bin/tool.ts', "await import('../src/lazy.ts');\n");
  write(root, 'src/used.ts', "import './nested';\nexport const used = 1;\n");
  write(root, 'src/nested/index.ts', 'export {};\n');
  write(root, 'src/shape.ts', 'export type Shape = { readonly id: string };\n');
  write(root, 'src/lazy.ts', 'export {};\n');
  write(root, 'src/types.d.ts', 'declare const ambient: number;\n');
  return root;
}

describe('source reachability gate', () => {
  it('rejects a new dead source even when the candidate adds an owner row', () => {
    const root = fixture();
    write(root, UNREACHABLE_SOURCE_ALLOWLIST_PATH, '# owned\n');
    execFileSync('git', ['init', '-b', 'main'], { cwd: root, stdio: 'pipe', timeout: 10_000 });
    execFileSync('git', ['add', '.'], { cwd: root, stdio: 'pipe', timeout: 10_000 });
    execFileSync('git', ['-c', 'user.name=Reachability fixture', '-c', 'user.email=fixture@example.invalid',
      'commit', '-m', 'accepted allowance'], { cwd: root, stdio: 'pipe', timeout: 10_000 });
    write(root, 'src/new-dead.ts', 'export const dead = 1;\n');
    write(root, UNREACHABLE_SOURCE_ALLOWLIST_PATH, '#814\tsrc/new-dead.ts\n');
    expect(checkSourceReachability(root, { base: 'main' }).violations)
      .toContain('NEW allowance #814\tsrc/new-dead.ts');
  });

  it('passes when every src file is reached through value, type, index or dynamic imports', () => {
    const root = fixture();
    expect(checkSourceReachability(root)).toEqual({ reached: 6, unreachable: [], violations: [] });
  });

  it('rejects an unlisted unreachable source in the working-tree inventory', () => {
    const root = fixture();
    write(root, 'src/dead.ts', 'export const dead = 1;\n');
    expect(checkSourceReachability(root).violations).toEqual(['NEW unreachable source src/dead.ts']);
  });

  it('fails on stale, malformed, ownerless and duplicate allowances', () => {
    const root = fixture();
    write(root, 'src/dead.ts', 'export const dead = 1;\n');
    write(root, UNREACHABLE_SOURCE_ALLOWLIST_PATH, [
      '#814\tsrc/dead.ts', '#814\tsrc/dead.ts', '#1052\tsrc/used.ts', 'src/other.ts', '#0\tsrc/zero.ts', '',
    ].join('\n'));
    expect(checkSourceReachability(root).violations).toEqual([
      'DUPLICATE allowance src/dead.ts',
      'MALFORMED allowance: src/other.ts',
      'MALFORMED allowance: #0\tsrc/zero.ts',
      'STALE allowance src/used.ts: it is reachable or gone; remove it',
    ]);
  });

  it('keeps this repository on its owned allow-list', () => {
    expect(checkSourceReachability(process.cwd()).violations).toEqual([]);
  });

  it('passes the working-tree command for a reached source inventory', async () => {
    const root = fixture();
    const originalDirectory = process.cwd();
    const originalExitCode = process.exitCode;
    try {
      process.chdir(root);
      process.exitCode = 0;
      vi.resetModules();
      await import('../../../scripts/source-reachability/check-source-reachability.ts');
      expect(process.exitCode).toBe(0);
    } finally {
      process.chdir(originalDirectory);
      process.exitCode = originalExitCode;
    }
  });

  it('refuses an unlisted dead file through the working-tree command', async () => {
    const root = fixture();
    write(root, 'src/dead.ts', 'export const dead = 1;\n');
    const originalDirectory = process.cwd();
    const originalExitCode = process.exitCode;
    try {
      process.chdir(root);
      process.exitCode = 0;
      vi.resetModules();
      await import('../../../scripts/source-reachability/check-source-reachability.ts');
      expect(process.exitCode).toBe(1);
    } finally {
      process.chdir(originalDirectory);
      process.exitCode = originalExitCode;
    }
  });
});
