import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const suiteRoots = [
  'test/integration',
  'test/unit/domain',
  'test/unit/infrastructure',
] as const;

const forbiddenFragments = [
  'WarpRuntime.open(',
  'src/domain/WarpRuntime.ts',
  'import WarpRuntime',
  'import type WarpRuntime',
  'instanceof WarpRuntime',
] as const;

function collectTestFiles(dir: string): readonly string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      files.push(...collectTestFiles(path));
      continue;
    }

    if (path.endsWith('.test.ts')) {
      files.push(path);
    }
  }

  return files;
}

describe('WarpRuntime suite migration', () => {
  it('keeps runtime-facing suites off the runtime class', () => {
    const suiteFiles = suiteRoots.flatMap((root) => collectTestFiles(join(process.cwd(), root)));

    for (const path of suiteFiles) {
      const text = readFileSync(path, 'utf8');

      for (const forbiddenFragment of forbiddenFragments) {
        expect(text, path).not.toContain(forbiddenFragment);
      }
    }
  });
});
