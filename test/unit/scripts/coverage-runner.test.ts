import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const directories: string[] = [];
const runner = resolve('scripts/RunCoverageTests.ts');
const baseline = `import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { coverage: { include: ['src/**/*.ts'], thresholds: { lines: 0, autoUpdate: false } } } });
`;

function fixture(source: string) {
  const root = mkdtempSync(join(tmpdir(), 'coverage-completion-'));
  directories.push(root);
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'test/unit'), { recursive: true });
  symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
  writeFileSync(join(root, 'package.json'), `{
    "type": "module", "scripts": {
      "test:coverage": "node ${runner} ratchet",
      "test:coverage:ci": "node ${runner} report"
    }
  }`);
  writeFileSync(join(root, 'vitest.config.ts'), baseline);
  writeFileSync(join(root, 'src/value.ts'), 'export function value() { return 42; }\n');
  writeFileSync(join(root, 'test/unit/value.test.ts'), source);
  return root;
}

const passingTest = `import { it, expect } from 'vitest';
import { value } from '../../src/value.ts';
it('covers the source', () => expect(value()).toBe(42));
`;

function run(root: string, script = 'test:coverage', args: string[] = []) {
  const result = spawnSync('npm', ['run', script, '--', ...args], {
    cwd: root, encoding: 'utf8', timeout: 80000,
  });
  return { ...result, output: result.stdout + result.stderr, config: readFileSync(join(root, 'vitest.config.ts'), 'utf8') };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('coverage runner completion and ratchet boundary', () => {
  it.each([{ args: [] }, { args: ['invalid'] }])('refuses a missing or invalid update intent $args', ({ args }) => {
    const root = fixture(passingTest);
    const result = spawnSync(process.execPath, [runner, ...args], { cwd: root, encoding: 'utf8', timeout: 10000 });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('expected ratchet or report mode');
    expect(readFileSync(join(root, 'vitest.config.ts'), 'utf8')).toBe(baseline);
  });
  it('raises the threshold after a complete actual npm coverage command', () => {
    const result = run(fixture(passingTest));
    expect(result.error).toBeUndefined();
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('instrumented workers=1; processing concurrency=1');
    expect(result.output).toContain('complete (1 files); zero errors');
    expect(result.config).toBe(baseline.replace('lines: 0,', 'lines: 100,'));
  });
  it('bounds instrumented worker admission under a controlled startup capacity limit', () => {
    const root = fixture(passingTest);
    mkdirSync(join(root, 'workers'));
    writeFileSync(join(root, 'capacity.cjs'), `const fs = require('node:fs');
      for (const entry of fs.readdirSync('workers')) {
        try { process.kill(Number(entry), 0); } catch { fs.unlinkSync('workers/' + entry); }
      }
      const active = 'workers/' + process.pid;
      fs.writeFileSync(active, 'active');
      const count = fs.readdirSync('workers').length;
      fs.appendFileSync('admissions.txt', String(count) + '\\n');
      process.on('exit', () => fs.unlinkSync(active));
      if (count > 1) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 65000);
    `);
    writeFileSync(join(root, 'vitest.config.ts'), baseline.replace('test: {', "test: { maxWorkers: 8, execArgv: ['--require', './capacity.cjs'],"));
    for (const name of ['second', 'third', 'fourth']) copyFileSync(join(root, 'test/unit/value.test.ts'), join(root, `test/unit/${name}.test.ts`));
    const result = run(root);
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('complete (4 files); zero errors');
    const admissions = readFileSync(join(root, 'admissions.txt'), 'utf8').trim().split('\n').map(Number);
    expect(admissions.length).toBeGreaterThan(0);
    expect(Math.max(...admissions)).toBe(1);
  });
  it('keeps an already attained threshold unchanged after a complete run', () => {
    const root = fixture(passingTest);
    const attained = baseline.replace('lines: 0,', 'lines: 100,');
    writeFileSync(join(root, 'vitest.config.ts'), attained);
    const result = run(root);
    expect(result.status, result.output).toBe(0);
    expect(result.config).toBe(attained);
  });
  it('refuses a failed coverage threshold even when all assertions pass', () => {
    const root = fixture(passingTest);
    const expected = baseline.replace('lines: 0,', 'lines: 100,');
    writeFileSync(join(root, 'vitest.config.ts'), expected);
    writeFileSync(join(root, 'src/value.ts'), 'export function value() { return 42; }\nexport function uncovered() { return 99; }\n');
    const result = run(root);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain('1 passed');
    expect(result.config).toBe(expected);
  });
  it('preserves a concurrent configuration edit instead of applying a candidate', () => {
    const root = fixture(passingTest + `import { afterAll } from 'vitest';
      import { readFileSync, writeFileSync } from 'node:fs';
      afterAll(() => writeFileSync('vitest.config.ts', readFileSync('vitest.config.ts', 'utf8') + '// concurrent edit\\n'));
    `);
    const result = run(root);
    expect(result.status, result.output).toBe(1);
    expect(result.config).toBe(baseline + '// concurrent edit\n');
  });
  it('refuses a malformed fresh report before applying a candidate', () => {
    const root = fixture(passingTest);
    writeFileSync(join(root, 'summary-control.ts'), `import { writeFileSync } from 'node:fs';
      export default class SummaryControl {
        onFinishedReportCoverage() { writeFileSync('coverage/coverage-summary.json', '{"total":{"lines":{"pct":101}}}'); }
      }`);
    writeFileSync(join(root, 'vitest.config.ts'), baseline.replace('test: {', "test: { reporters: ['default', './summary-control.ts'],"));
    const original = readFileSync(join(root, 'vitest.config.ts'), 'utf8');
    const result = run(root);
    expect(result.status, result.output).toBe(1);
    expect(result.config).toBe(original);
  });
  it('refuses a failed atomic candidate launch without modifying the config', () => {
    const root = fixture(passingTest);
    writeFileSync(join(root, 'vitest.config.ts.coverage-candidate'), 'existing candidate');
    const result = run(root);
    expect(result.status, result.output).toBe(1);
    expect(result.config).toBe(baseline);
  });
  it.each(['test:coverage:ci', 'targeted'])('keeps reporting-only %s runs unchanged', command => {
    const root = fixture(passingTest);
    const result = command === 'targeted' ? run(root, 'test:coverage', ['test/unit/value.test.ts']) : run(root, command);
    expect(result.status, result.output).toBe(0);
    expect(result.config).toBe(baseline);
  });
  it('refuses an unhandled tool error even when all assertions pass', () => {
    const root = fixture(passingTest + `it('still passes', async () => {
      Promise.reject(new Error('controlled unhandled error'));
      await new Promise(resolve => setTimeout(resolve, 25));
      expect(value()).toBe(42);
    });\n`);
    const result = run(root);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain('2 passed');
    expect(result.output).toContain('controlled unhandled error');
    expect(result.config).toBe(baseline);
  });
  it.each(['assertion', 'worker', 'empty', 'teardown', 'skipped'])('refuses %s failure without a ratchet write', mode => {
    const root = fixture(mode === 'assertion' ? passingTest.replace('toBe(42)', 'toBe(99)') : passingTest);
    let args: string[] = [];
    if (mode === 'worker') {
      writeFileSync(join(root, 'vitest.config.ts'), baseline.replace('test: {', "test: { execArgv: ['--require', './missing-worker-preload.cjs'],"));
    } else if (mode === 'empty') args = ['missing-selection'];
    else if (mode === 'skipped') writeFileSync(join(root, 'test/unit/value.test.ts'), passingTest.replace("it('", "it.skip('"));
    else if (mode === 'teardown') {
      writeFileSync(join(root, 'teardown.ts'), "export default function setup() { return () => { throw new Error('controlled teardown error'); }; }\n");
      writeFileSync(join(root, 'vitest.config.ts'), baseline.replace('test: {', "test: { globalSetup: './teardown.ts',"));
    }
    const original = readFileSync(join(root, 'vitest.config.ts'), 'utf8');
    const result = run(root, 'test:coverage', args);
    expect(result.status, result.output).toBe(1);
    expect(result.config).toBe(original);
  }, 90000);
  it('refuses coverage reported after only part of a selected manifest completed', () => {
    const root = fixture(passingTest);
    copyFileSync(join(root, 'test/unit/value.test.ts'), join(root, 'test/unit/second.test.ts'));
    const result = run(root, 'test:coverage', ['--shard=1/2']);
    expect(result.config).toBe(baseline);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain('incomplete or failed run');
  });
});
