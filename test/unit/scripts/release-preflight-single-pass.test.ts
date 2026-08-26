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
  it('runs each expensive validation gate once before nested pack validation', async () => {
    const [preflight, smoke, packagePayload, packageJsonText] = await Promise.all([
      repositoryText('scripts/release-preflight.sh'),
      repositoryText('scripts/smoke-packed-artifact.sh'),
      repositoryText('scripts/package-payload/CheckPackagePayload.ts'),
      repositoryText('package.json'),
    ]);
    const packageJson = JSON.parse(packageJsonText) as {
      readonly scripts: Readonly<Record<string, string>>;
    };

    expect(matchingLines(preflight, /^if npm run lint --silent /u)).toHaveLength(1);
    expect(matchingLines(preflight, /^if npm run test:coverage:ci /u)).toHaveLength(1);
    expect(matchingLines(preflight, /^if npm run typecheck:consumer /u)).toHaveLength(1);
    expect(matchingLines(preflight, /^if npm run typecheck:surface /u)).toHaveLength(1);
    expect(matchingLines(preflight, /^if npm run check:package-payload/u)).toHaveLength(1);
    expect(matchingLines(smoke, /CheckPackagePayload\.ts --pack-destination/u)).toHaveLength(1);
    expect(packagePayload).toContain("['pack', '--dry-run', '--ignore-scripts', '--json']");
    expect(preflight).toContain('smoke-packed-artifact.sh --prepared-artifacts');
    expect(smoke).toContain('--prepared-artifacts');
    expect(packageJson.scripts['prepack']).toBe(
      'npm run build && npm run lint && npm run test:local && npm run typecheck:consumer && npm run check:package-payload'
    );
  });

  it('requests recursive lifecycle suppression for every validation pack', async () => {
    const [packagePayload, releasePr, release] = await Promise.all([
      repositoryText('scripts/package-payload/CheckPackagePayload.ts'),
      repositoryText('.github/workflows/release-pr.yml'),
      repositoryText('.github/workflows/release.yml'),
    ]);

    expect(packagePayload).toContain("['pack', '--dry-run', '--ignore-scripts', '--json']");
    expect(packagePayload).toContain("['pack', '--pack-destination', destination");
    expect(releasePr).toContain('npm run check:package-payload');
    expect(release).toContain('npm run check:package-payload');
  });
});
