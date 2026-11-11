import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// eslint.config.ts rejects wall-clock reads and real timer waits in test/**
// outside test/benchmark/**. A line may opt out only with a
// `no-restricted-syntax` disable that names one of these reasons.
const ALLOWANCE_REASONS = Object.freeze([
  'process bound',
  'fake timers',
  'benchmark measurement',
  'host clock default',
]);

const ALLOWANCE_PATTERN = new RegExp(
  `^\\s*// eslint-disable-next-line no-restricted-syntax -- (?:${ALLOWANCE_REASONS.join('|')}): \\S.{9,}$`,
);

const repoRoot = process.cwd();

function testSourceFiles(relativePath = 'test'): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(join(repoRoot, relativePath), { withFileTypes: true })) {
    const entryPath = `${relativePath}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entryPath !== 'test/benchmark') {
        files.push(...testSourceFiles(entryPath));
      }
    } else if (entry.name.endsWith('.ts')) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

// This file quotes directives as test data, so it does not scan itself.
const THIS_FILE = 'test/unit/scripts/test-wall-clock-allowances.test.ts';
const DIRECTIVE_PATTERN = /(?:\/\/|\/\*)\s*eslint-(?:disable|enable)/;

function restrictedSyntaxDirectives(): Array<{ readonly where: string; readonly line: string }> {
  const directives: Array<{ readonly where: string; readonly line: string }> = [];
  for (const file of testSourceFiles().filter((path) => path !== THIS_FILE)) {
    readFileSync(join(repoRoot, file), 'utf8').split('\n').forEach((line, index) => {
      if (DIRECTIVE_PATTERN.test(line) && line.includes('no-restricted-syntax')) {
        directives.push({ where: `${file}:${index + 1}`, line });
      }
    });
  }
  return directives;
}

describe('test wall-clock allowances', () => {
  it('names a reason on every line that opts out of the wall-clock rule', () => {
    const directives = restrictedSyntaxDirectives();
    // Witness count: the scan must see the known allowances, or it proves nothing.
    expect(directives.length).toBeGreaterThan(0);
    const unexplained = directives
      .filter(({ line }) => !ALLOWANCE_PATTERN.test(line))
      .map(({ where, line }) => `${where}: ${line.trim()}`);
    expect(unexplained).toEqual([]);
  });

  it('rejects an allowance that names no reason or an unknown reason', () => {
    expect(ALLOWANCE_PATTERN.test('// eslint-disable-next-line no-restricted-syntax')).toBe(false);
    expect(ALLOWANCE_PATTERN.test('// eslint-disable-next-line no-restricted-syntax -- because')).toBe(false);
    expect(ALLOWANCE_PATTERN.test('/* eslint-disable no-restricted-syntax */')).toBe(false);
    expect(ALLOWANCE_PATTERN.test('setTimeout(done, 5); // eslint-disable-line no-restricted-syntax -- process bound: trailing form')).toBe(false);
    expect(ALLOWANCE_PATTERN.test('// eslint-disable-next-line no-restricted-syntax -- process bound: kills a hung child process')).toBe(true);
  });
});
