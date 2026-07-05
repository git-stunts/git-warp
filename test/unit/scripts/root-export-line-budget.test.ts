import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SOURCE_LINE_LIMIT = 500;

function readRepoFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

function lineCount(source: string): number {
  return source.split('\n').length;
}

describe('root export line budget', () => {
  it('keeps the package root barrel below the source line cap', () => {
    const lines = lineCount(readRepoFile('../../../index.ts'));

    expect(lines).toBeLessThanOrEqual(SOURCE_LINE_LIMIT);
  });

  it('keeps the legacy compatibility barrel below the source line cap', () => {
    const lines = lineCount(readRepoFile('../../../legacy.ts'));

    expect(lines).toBeLessThanOrEqual(SOURCE_LINE_LIMIT);
  });
});
