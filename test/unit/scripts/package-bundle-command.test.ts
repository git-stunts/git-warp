import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

const originalArgv = process.argv;
const originalExitCode = process.exitCode;
const roots: string[] = [];

/** Executes the real synchronous CLI entrypoint with isolated process arguments. */
async function run(args: readonly string[]): Promise<void> {
  process.argv = ['node', 'ReportPackagePayload.ts', ...args];
  process.exitCode = undefined;
  vi.resetModules();
  await import('../../../scripts/package-payload/ReportPackagePayload.ts');
}

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it.each([[], ['package'], ['package', 'inventory'], ['package', 'inventory', 'report']])(
  'rejects missing report arguments %j', async (...args) => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    await run(args);
    expect(process.exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('usage: ReportPackagePayload.ts'));
  }
);

it('writes advisory evidence even when the inventory violates payload policy', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bundle-command-'));
  roots.push(root);
  writeFileSync(join(root, 'package.json'), '{"exports":{},"bin":{}}');
  const inventory = join(root, 'inventory.json');
  writeFileSync(inventory, '[{"size":20,"unpackedSize":23,"entryCount":1,"files":[{"path":"package.json","size":23}]}]');
  const report = join(root, 'report.md');
  const findings = join(root, 'findings.txt');
  await run([root, inventory, report, findings]);
  expect(process.exitCode).toBeUndefined();
  expect(readFileSync(report, 'utf8')).toContain('| Compressed bytes | 20 |');
  expect(readFileSync(findings, 'utf8')).toContain('required path is missing: dist/index.js');
});

it('fails closed on an unreadable inventory instead of reporting successful analysis', async () => {
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  await run(['absent-package', 'absent-inventory', 'report', 'findings']);
  expect(process.exitCode).toBe(1);
  expect(stderr).toHaveBeenCalledWith(expect.stringContaining('bundle-analysis:'));
});
