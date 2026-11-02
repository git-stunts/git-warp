import { spawnSync, type SpawnSyncOptionsWithBufferEncoding } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeFileTrace } from '@vercel/nft';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const CHILD_TIMEOUT_MS = 15_000;
const CHILD_OUTPUT_BYTES = 64 * 1024;
const CHILD_HEAP_MIB = 96;
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const childLimits = { timeout: CHILD_TIMEOUT_MS, maxBuffer: CHILD_OUTPUT_BYTES, killSignal: 'SIGKILL' } satisfies SpawnSyncOptionsWithBufferEncoding;

it('bounds pattern amplification and preserves matching at each overridden caller', () => {
  const fixture = fileURLToPath(new URL('../../fixtures/minimatch-security-probe.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [`--max-old-space-size=${CHILD_HEAP_MIB}`, fixture], childLimits);
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr.toString()).toBe(0);
  expect(result.stdout.toString()).toContain('caller matching and expansion bounds passed');
});

it('stops filesystem traversal when the tracing dependency receives cancellation', () => {
  const fixture = fileURLToPath(new URL('../../fixtures/glob-abort-security-probe.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [`--max-old-space-size=${CHILD_HEAP_MIB}`, fixture], childLimits);
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr.toString()).toBe(0);
  expect(result.stdout.toString()).toContain('glob cancellation stopped traversal');
});

it('keeps the actual ESLint policy active for included files and excludes generated files', () => {
  const cli = join(dirname(require.resolve('eslint/package.json')), 'bin/eslint.js');
  const args = [cli, '--stdin', '--stdin-filename', 'test/glob-probe.js', '--format', 'json'];
  const valid = spawnSync(process.execPath, args, { ...childLimits, cwd: REPO_ROOT, input: 'export const value = 1;\n' });
  expect(valid.error).toBeUndefined();
  expect(valid.status, valid.stderr.toString()).toBe(0);
  const typed = spawnSync(process.execPath, [cli, '--stdin', '--stdin-filename', 'test/unit/scripts/dependency-glob-compatibility.test.ts'], {
    ...childLimits, cwd: REPO_ROOT, input: 'export function identity(value: number): number { return value; }\n',
  });
  expect(typed.error).toBeUndefined();
  expect(typed.status, typed.stderr.toString() + typed.stdout.toString()).toBe(0);
  const invalid = spawnSync(process.execPath, args, { ...childLimits, cwd: REPO_ROOT, input: 'const unused = 1;\n' });
  expect(invalid.error).toBeUndefined();
  expect(invalid.status).toBe(1);
  expect(invalid.stdout.toString()).toContain('no-unused-vars');
  const ignored = spawnSync(process.execPath, [cli, '--stdin', '--stdin-filename', 'dist/glob-probe.js', '--no-warn-ignored'], {
    ...childLimits, cwd: REPO_ROOT, input: 'const unused = 1;\n',
  });
  expect(ignored.error).toBeUndefined();
  expect(ignored.status, ignored.stderr.toString()).toBe(0);
});

it('preserves Markdown CLI globs and exclusion rules', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'markdown-glob-'));
  const cli = join(dirname(require.resolve('markdownlint-cli/package.json')), 'markdownlint.js');
  try {
    await mkdir(join(directory, 'ignored'));
    await writeFile(join(directory, 'kept.md'), '# Heading\n');
    await writeFile(join(directory, 'ignored', 'bad.md'), '#Missing space\n');
    const accepted = spawnSync(process.execPath, [cli, '**/*.md', '--ignore', 'ignored/**'], { ...childLimits, cwd: directory });
    expect(accepted.error).toBeUndefined();
    expect(accepted.status, accepted.stderr.toString()).toBe(0);
    const rejected = spawnSync(process.execPath, [cli, '**/*.md'], { ...childLimits, cwd: directory });
    expect(rejected.error).toBeUndefined();
    expect(rejected.status).toBe(1);
    expect(rejected.stderr.toString()).toContain('bad.md');
    expect(rejected.stderr.toString()).toContain('MD018');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('retains dynamically selected assets through the actual package tracer', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nft-glob-'));
  try {
    await mkdir(join(directory, 'assets'));
    await writeFile(join(directory, 'package.json'), '{"type":"commonjs"}\n');
    await writeFile(join(directory, 'entry.js'), "const fs = require('node:fs'); const path = require('node:path'); module.exports = fs.readFileSync(path.join(__dirname, 'assets', process.env.ASSET + '.txt'), 'utf8');\n");
    await writeFile(join(directory, 'assets', 'first.txt'), 'first');
    await writeFile(join(directory, 'assets', 'second.txt'), 'second');
    await writeFile(join(directory, 'unrelated.txt'), 'excluded');
    const traced = await nodeFileTrace([join(directory, 'entry.js')], { base: directory });
    expect([...traced.warnings]).toEqual([]);
    expect([...traced.fileList].sort()).toEqual(['assets/first.txt', 'assets/second.txt', 'entry.js', 'package.json']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
