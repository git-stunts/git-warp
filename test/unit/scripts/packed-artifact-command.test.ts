import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

const roots: string[] = [];
const originalArgv = process.argv;
const originalExitCode = process.exitCode;

/** Creates a self-contained installed-package fixture. */
function fixture(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'packed-artifact-command-'));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

/** Runs the actual command entry point and waits for its completion report. */
async function check(args: readonly string[]) {
  const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  process.argv = ['node', 'CheckPackedArtifact.ts', ...args];
  process.exitCode = undefined;
  vi.resetModules();
  await import('../../../scripts/package-payload/CheckPackedArtifact.ts');
  await vi.waitFor(() => {
    expect(stdout.mock.calls.length + stderr.mock.calls.length).toBeGreaterThan(0);
  });
  return {
    stdout: stdout.mock.calls.map(([chunk]) => String(chunk)).join(''),
    stderr: stderr.mock.calls.map(([chunk]) => String(chunk)).join(''),
    exitCode: process.exitCode,
  };
}

/** Supplies the same installer capability consumed from the published CLI. */
function hookFixture(stamp: string, mode = '0o755'): string {
  return fixture({
    'package.json': '{"type":"module","version":"19.1.0"}',
    'dist/bin/cli/shared.js': `
      import { mkdirSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      export function createHookInstaller(port) {
        return { async install() {
          const hooks = await port.resolveHooksDir();
          mkdirSync(hooks, { recursive: true });
          writeFileSync(join(hooks, 'post-merge'), '${stamp}\\n', { mode: ${mode} });
          return { action: 'installed' };
        } };
      }
    `,
  });
}

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it.each(['# warp-hook-version: 19.1.01', '# text # warp-hook-version: 19.1.0'])(
  'rejects a hook with a non-exact version stamp: %s',
  async (stamp) => {
    const root = hookFixture(stamp);
    const result = await check(['hook', root, root]);
    expect(result.stderr).toContain('installed hook was not stamped');
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
  }
);
