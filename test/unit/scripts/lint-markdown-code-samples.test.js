import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectMarkdownFiles,
  extractMarkdownCodeSamples,
  lintMarkdownCodeSample,
  lintMarkdownCodeSamples,
  parseFenceLanguage,
} from '../../../scripts/lint-markdown-code-samples.js';

/** @type {string[]} */
const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(/** @type {string} */ (tempDirs.pop()), { force: true, recursive: true });
  }
});

/**
 * @returns {string}
 */
function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'git-warp-md-code-'));
  tempDirs.push(dir);
  return dir;
}

describe('parseFenceLanguage', () => {
  it('accepts JavaScript and TypeScript fence labels', () => {
    expect(parseFenceLanguage('javascript')).toBe('javascript');
    expect(parseFenceLanguage('ts title="example"')).toBe('ts');
  });

  it('ignores non-code-sample fence labels', () => {
    expect(parseFenceLanguage('bash')).toBeNull();
    expect(parseFenceLanguage('')).toBeNull();
  });
});

describe('extractMarkdownCodeSamples', () => {
  it('extracts JS and TS fences with accurate start lines', () => {
    const markdown = [
      '# Demo',
      '```javascript',
      'const answer = 42;',
      '```',
      '',
      '```ts title="types"',
      'export const value: number = 1;',
      '```',
    ].join('\n');

    expect(extractMarkdownCodeSamples(markdown, 'README.md')).toEqual([
      {
        filePath: 'README.md',
        language: 'javascript',
        code: 'const answer = 42;',
        fenceLine: 2,
        startLine: 3,
      },
      {
        filePath: 'README.md',
        language: 'ts',
        code: 'export const value: number = 1;',
        fenceLine: 6,
        startLine: 7,
      },
    ]);
  });

  it('ignores non-JS/TS fences', () => {
    const markdown = [
      '```bash',
      'npm run test',
      '```',
      '',
      '```text',
      'plain text block',
      '```',
    ].join('\n');

    expect(extractMarkdownCodeSamples(markdown, 'GUIDE.md')).toEqual([]);
  });
});

describe('lintMarkdownCodeSample', () => {
  it('accepts valid JavaScript and TypeScript snippets', () => {
    const jsSample = {
      filePath: 'README.md',
      language: /** @type {'javascript'} */ ('javascript'),
      code: 'export const answer = 42;',
      fenceLine: 10,
      startLine: 11,
    };
    const tsSample = {
      filePath: 'GUIDE.md',
      language: /** @type {'ts'} */ ('ts'),
      code: 'export const answer: number = 42;',
      fenceLine: 20,
      startLine: 21,
    };

    expect(lintMarkdownCodeSample(jsSample)).toEqual([]);
    expect(lintMarkdownCodeSample(tsSample)).toEqual([]);
  });

  it('reports syntax errors with Markdown-relative locations', () => {
    const sample = {
      filePath: 'README.md',
      language: /** @type {'javascript'} */ ('javascript'),
      code: 'export const broken = ;',
      fenceLine: 5,
      startLine: 6,
    };

    expect(lintMarkdownCodeSample(sample)).toEqual([
      {
        filePath: 'README.md',
        line: 6,
        column: 23,
        language: 'javascript',
        message: 'Expression expected.',
      },
    ]);
  });
});

describe('collectMarkdownFiles', () => {
  it('walks Markdown files and ignores hidden directories', () => {
    const root = createTempDir();
    mkdirSync(join(root, 'docs'));
    mkdirSync(join(root, '.hidden'));
    writeFileSync(join(root, 'README.md'), '# root\n');
    writeFileSync(join(root, 'docs', 'GUIDE.md'), '# guide\n');
    writeFileSync(join(root, '.hidden', 'SECRET.md'), '# secret\n');

    expect(collectMarkdownFiles(root)).toEqual([
      join(root, 'README.md'),
      join(root, 'docs', 'GUIDE.md'),
    ]);
  });
});

describe('lintMarkdownCodeSamples', () => {
  it('checks extracted samples across Markdown files', () => {
    const root = createTempDir();
    const goodDoc = join(root, 'README.md');
    const badDoc = join(root, 'docs', 'broken.md');
    mkdirSync(join(root, 'docs'));
    writeFileSync(goodDoc, '```js\nexport const ok = 1;\n```\n');
    writeFileSync(badDoc, '```ts\nexport const broken: = 1;\n```\n');

    expect(lintMarkdownCodeSamples([goodDoc, badDoc])).toEqual([
      {
        filePath: badDoc,
        line: 2,
        column: 22,
        language: 'ts',
        message: 'Type expected.',
      },
    ]);
  });
});
