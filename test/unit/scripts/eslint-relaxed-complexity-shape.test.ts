import { describe, expect, it } from 'vitest';

import eslintConfig from '../../../eslint.config.ts';

function duplicateFiles(files: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const file of files) {
    if (seen.has(file)) {
      duplicates.add(file);
      continue;
    }
    seen.add(file);
  }
  return [...duplicates].sort();
}

describe('ESLint relaxed complexity shape', () => {
  it('does not list the same file twice inside one override block', () => {
    const duplicateEntries = [];

    for (const entry of eslintConfig) {
      if (!Array.isArray(entry.files)) {
        continue;
      }
      const duplicates = duplicateFiles(entry.files);
      if (duplicates.length === 0) {
        continue;
      }
      duplicateEntries.push({
        files: entry.files,
        duplicates,
      });
    }

    expect(duplicateEntries).toEqual([]);
  });
});
