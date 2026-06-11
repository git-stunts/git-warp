import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SOURCE_LINE_LIMIT = 500;
const COMPARISON_SELECTOR_FILES = [
  '../../../src/domain/services/controllers/ComparisonSelector.ts',
  '../../../src/domain/services/controllers/ComparisonSelectorSupport.ts',
] as const;

function readOptionalRepoFile(relativePath: string): string | null {
  try {
    return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function lineCount(source: string): number {
  return source.split('\n').length;
}

describe('comparison selector file budget', () => {
  it('keeps comparison selector modules below the source line cap', () => {
    const offenders = COMPARISON_SELECTOR_FILES.flatMap((path) => {
      const source = readOptionalRepoFile(path);
      if (source === null) {
        return [];
      }
      const lines = lineCount(source);
      return lines > SOURCE_LINE_LIMIT ? [`${path}: ${lines}`] : [];
    });

    expect(offenders).toEqual([]);
  });
});
