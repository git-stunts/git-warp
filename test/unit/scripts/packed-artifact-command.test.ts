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

it.each([[], ['invalid'], ['documents'], ['documents', '']])(
  'rejects invalid arguments %j',
  async (...args) => {
    const result = await check(args);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/usage:|missing argument/u);
  }
);

it.each(['documents', 'imports'])('accepts a closed artifact for %s', async (command) => {
  const root = fixture({ 'README.md': '[self](README.md)', 'dist/index.js': 'export {};' });
  const result = await check([command, root]);
  expect(result.stdout).toContain(`${command} PASS`);
  expect(result.exitCode).toBeUndefined();
});

it.each(['documents', 'imports'])('rejects an incomplete artifact for %s', async (command) => {
  const root = fixture({ 'README.md': '[bad](missing.md)', 'dist/index.js': "import './missing.js';" });
  const result = await check([command, root]);
  expect(result.stderr).toContain('escape the artifact');
  expect(result.exitCode).toBe(1);
});

it('accepts an exactly stamped executable hook', async () => {
  const root = hookFixture('# warp-hook-version: 19.1.0');
  expect((await check(['hook', root, root])).stdout).toContain('hook PASS');
});

it('rejects an exactly stamped hook without executable permissions', async () => {
  const root = hookFixture('# warp-hook-version: 19.1.0', '0o644');
  expect((await check(['hook', root, root])).stderr).toContain('not executable');
});

const VALID_RESULTS = Object.freeze({
  'write.json': '{"lane":"events","intent":{"kind":"property.set"}}',
  'observe.json': '{"readings":[{"value":"admin","reducerVersion":"observed-remove/node-lww-clear"}],"receipt":{"reducerVersion":"observed-remove/node-lww-clear"}}',
  'doctor-before.json': '{"findings":[{"id":"hooks-installed","code":"HOOKS_MISSING","status":"warn"}]}',
  'doctor-after.json': '{"findings":[{"id":"hooks-installed","code":"HOOKS_OK","status":"ok"}]}',
  'upgrade.json': '{"dryRun":true,"graphs":[{"graphName":"events","checkpoint":{"status":"already-current"}}]}',
});

it('accepts complete CLI and migration smoke results', async () => {
  expect((await check(['results', fixture(VALID_RESULTS)])).stdout).toContain('results PASS');
});

it.each([
  ['observe.json', '{"readings":[{"value":"guest","reducerVersion":"observed-remove/node-lww-clear"}],"receipt":{"reducerVersion":"observed-remove/node-lww-clear"}}', 'did not read the written value'],
  ['doctor-before.json', '{"findings":[{"id":"other","code":"FAILED","status":"fail"}]}', 'failed checks'],
  ['doctor-before.json', '{"findings":[]}', 'is not HOOKS_MISSING'],
  ['doctor-after.json', '{"findings":[{"id":"hooks-installed","code":"HOOKS_MISSING","status":"warn"}]}', 'is not HOOKS_OK'],
  ['upgrade.json', '{"dryRun":true,"graphs":[{"graphName":"other","checkpoint":{"status":"already-current"}}]}', 'did not classify'],
  ['upgrade.json', '{"dryRun":true,"graphs":[{"graphName":"events","checkpoint":{"status":"pending"}}]}', 'did not classify'],
])('rejects incorrect smoke evidence in %s', async (path, content, message) => {
  const result = await check(['results', fixture({ ...VALID_RESULTS, [path]: content })]);
  expect(result.stderr).toContain(message);
  expect(result.exitCode).toBe(1);
});

it('rejects readings that omit their reducer interpretation', async () => {
  const result = await check(['results', fixture({
    ...VALID_RESULTS, 'observe.json': '{"readings":[{"value":"admin"}]}',
  })]);
  expect(result.exitCode).toBe(1);
});
