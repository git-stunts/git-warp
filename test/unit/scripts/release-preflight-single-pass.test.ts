import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = new URL('../../../', import.meta.url);

async function repositoryText(relativePath: string): Promise<string> {
  return await readFile(new URL(relativePath, REPO_ROOT), 'utf8');
}

function matchingLines(source: string, pattern: RegExp): readonly string[] {
  return source.split('\n').filter((line) => pattern.test(line));
}

describe('single-pass release preflight', () => {
  it('runs each expensive validation gate once before lifecycle-free packing', async () => {
    const [preflight, smoke, packageJsonText] = await Promise.all([
      repositoryText('scripts/release-preflight.sh'),
      repositoryText('scripts/smoke-packed-artifact.sh'),
      repositoryText('package.json'),
    ]);
    const packageJson = JSON.parse(packageJsonText) as {
      readonly scripts: Readonly<Record<string, string>>;
    };

    expect(matchingLines(preflight, /^if npm run lint --silent /u)).toHaveLength(1);
    expect(matchingLines(preflight, /^if npm run test:coverage:ci /u)).toHaveLength(1);
    expect(matchingLines(preflight, /^if npm run typecheck:consumer /u)).toHaveLength(1);
    expect(matchingLines(preflight, /^if npm run typecheck:surface /u)).toHaveLength(1);
    expect(preflight).toContain('npm pack --dry-run --ignore-scripts');
    expect(preflight).toContain('smoke-packed-artifact.sh --prepared-artifacts');
    expect(smoke).toContain('--prepared-artifacts');
    expect(packageJson.scripts['prepack']).toBe(
      'npm run build && npm run lint && npm run test:local && npm run typecheck:consumer'
    );
  });

  it('suppresses lifecycle scripts in every validation-only pack dry-run', async () => {
    const sources = await Promise.all([
      repositoryText('scripts/release-preflight.sh'),
      repositoryText('.github/workflows/release-pr.yml'),
      repositoryText('.github/workflows/release.yml'),
    ]);

    for (const source of sources) {
      const packDryRuns = matchingLines(source, /npm pack --dry-run/u);
      expect(packDryRuns.length).toBeGreaterThan(0);
      expect(packDryRuns.every((line) => line.includes('--ignore-scripts'))).toBe(true);
    }
  });
});
