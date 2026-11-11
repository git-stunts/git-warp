import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// eslint.config.ts rejects wall-clock reads and real timer waits in test/**
// outside test/benchmark/**. A line may opt out only with a
// `no-restricted-syntax` next-line disable that names one of these reasons.
// No other comment may switch that rule off: no blanket disable, no other
// disable form, and no inline rule config.
const ALLOWANCE_REASONS = Object.freeze([
  'process bound',
  'fake timers',
  'benchmark measurement',
  'host clock default',
]);

const ALLOWANCE_PATTERN = new RegExp(
  `^\\s*// eslint-disable-next-line no-restricted-syntax -- (?:${ALLOWANCE_REASONS.join('|')}): \\S.{9,}$`,
);
const DIRECTIVE_PATTERN = /(?:\/\/|\/\*)\s*eslint-(?:disable|enable)(?:-next-line|-line)?/;
const BLANKET_PATTERN = /(?:\/\/|\/\*)\s*eslint-(?:disable|enable)(?:-next-line|-line)?\s*(?:--|\*\/|$)/;
const INLINE_CONFIG_PATTERN = /(?:\/\/|\/\*)\s*eslint\s[^\n]*no-restricted-syntax/;

/** The reason a test-source line may not stand, or null when it may. */
function directiveProblem(line: string): string | null {
  if (BLANKET_PATTERN.test(line)) {
    return 'blanket directive names no rule';
  }
  if (INLINE_CONFIG_PATTERN.test(line)) {
    return 'inline config changes no-restricted-syntax';
  }
  if (DIRECTIVE_PATTERN.test(line) && line.includes('no-restricted-syntax') && !ALLOWANCE_PATTERN.test(line)) {
    return 'no-restricted-syntax directive without the allowance form';
  }
  return null;
}

const repoRoot = process.cwd();
// This file quotes directives as test data, so it does not scan itself.
const THIS_FILE = 'test/unit/scripts/test-wall-clock-allowances.test.ts';

function testSourceFiles(relativePath = 'test'): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(join(repoRoot, relativePath), { withFileTypes: true })) {
    const entryPath = `${relativePath}/${entry.name}`;
    if (entry.isDirectory()) {
      // Installed fixture dependencies are not test source.
      if (entryPath !== 'test/benchmark' && entry.name !== 'node_modules') {
        files.push(...testSourceFiles(entryPath));
      }
    } else if (/\.(?:[cm]?ts|[cm]?js)$/.test(entry.name) && entryPath !== THIS_FILE) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function scanTestSources(): { readonly allowances: number; readonly problems: readonly string[] } {
  let allowances = 0;
  const problems: string[] = [];
  for (const file of testSourceFiles()) {
    readFileSync(join(repoRoot, file), 'utf8').split('\n').forEach((line, index) => {
      if (ALLOWANCE_PATTERN.test(line)) {
        allowances += 1;
      }
      const problem = directiveProblem(line);
      if (problem !== null) {
        problems.push(`${file}:${index + 1}: ${problem}: ${line.trim()}`);
      }
    });
  }
  return { allowances, problems };
}

describe('test wall-clock allowances', () => {
  it('lets only the named-reason allowance switch off the wall-clock rule', () => {
    const { allowances, problems } = scanTestSources();
    // Witness count: the scan must see the known allowances, or it proves nothing.
    expect(allowances).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });

  it.each([
    ['// eslint-disable-next-line no-restricted-syntax', 'no-restricted-syntax directive without the allowance form'],
    ['// eslint-disable-next-line no-restricted-syntax -- because', 'no-restricted-syntax directive without the allowance form'],
    ['/* eslint-disable no-restricted-syntax */', 'no-restricted-syntax directive without the allowance form'],
    ['setTimeout(done, 5); // eslint-disable-line no-restricted-syntax -- process bound: trailing form', 'no-restricted-syntax directive without the allowance form'],
    ['// eslint-disable-next-line', 'blanket directive names no rule'],
    ['// eslint-disable-next-line -- process bound: names no rule', 'blanket directive names no rule'],
    ['/* eslint-disable */', 'blanket directive names no rule'],
    ['setTimeout(done, 5); // eslint-disable-line', 'blanket directive names no rule'],
    ['/* eslint no-restricted-syntax: "off" */', 'inline config changes no-restricted-syntax'],
    ['/* eslint no-console: "off", no-restricted-syntax: ["error"] */', 'inline config changes no-restricted-syntax'],
  ])('rejects %s', (line, problem) => {
    expect(directiveProblem(line)).toBe(problem);
  });

  it.each([
    '// eslint-disable-next-line no-restricted-syntax -- process bound: kills a hung child process',
    '// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy fixture',
    'const value = 1; // an ordinary comment',
  ])('accepts %s', (line) => {
    expect(directiveProblem(line)).toBeNull();
  });
});
