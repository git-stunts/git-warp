import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const compatibilityModulePath = 'test/helpers/warpGraphTestUtils.ts';

const conceptModulePaths = [
  'test/helpers/WarpGraphObjectIds.ts',
  'test/helpers/WarpGraphMockPersistence.ts',
  'test/helpers/WarpGraphPatchFixtures.ts',
  'test/helpers/WarpGraphMockLogger.ts',
  'test/helpers/WarpGraphTestRepositories.ts',
  'test/helpers/WarpGraphStateSeed.ts',
] as const;

function readRepoFile(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, 'utf8');
}

function lineCount(source: string): number {
  return source.split('\n').filter((line) => line.trim().length > 0).length;
}

describe('warp graph test helper structure', () => {
  it('keeps the legacy helper path as a small compatibility barrel', () => {
    const source = readRepoFile(compatibilityModulePath);

    expect(lineCount(source)).toBeLessThanOrEqual(32);
    expect(source).not.toMatch(/\bexport\s+function\b/);
    expect(source).not.toMatch(/\bfunction\s+create[A-Z]/);
    expect(source).not.toMatch(/\breturn\s+\{/);
  });

  it('splits helper responsibilities into named concept modules', () => {
    const barrelSource = readRepoFile(compatibilityModulePath);

    for (const path of conceptModulePaths) {
      expect(existsSync(`${repoRoot}${path}`), path).toBe(true);
      expect(barrelSource, path).toContain(`'./${basename(path)}'`);
    }
  });
});
