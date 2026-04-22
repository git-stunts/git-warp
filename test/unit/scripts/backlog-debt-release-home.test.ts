import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const backlogReadme = readFileSync(`${repoRoot}docs/method/backlog/README.md`, 'utf8');
const badCodeReadme = readFileSync(`${repoRoot}docs/method/backlog/bad-code/README.md`, 'utf8');

const badCodePaths = execFileSync('git', ['ls-files', '-z', 'docs/method/backlog/bad-code/*.md'], {
  cwd: repoRoot,
  encoding: 'utf8',
})
  .split('\0')
  .filter((path) => path.length > 0)
  .filter((path) => !path.endsWith('/README.md'));

const releaseHomeByFeature = new Map<string, string>([
  ['api-capabilities', 'v17.0.0'],
  ['runtime-boundaries', 'v17.0.0'],
  ['materialization-query-index', 'v17.0.0'],
  ['trie-state-storage', 'v17.0.0'],
  ['sync-trust-security', 'v17.0.0'],
  ['testing-quality', 'v17.0.0'],
  ['docs-dx', 'v17.0.0'],
  ['tooling-release', 'v17.0.0'],
  ['browser-viz', 'v17.0.0'],
  ['graph-model-substrate', 'v18.0.0'],
  ['observer-admission-runtime', 'v19.0.0'],
  ['merge-strands-worldlines', 'v20.0.0+'],
]);

function readFrontmatter(path: string): string {
  const text = readFileSync(`${repoRoot}${path}`, 'utf8');
  expect(text.startsWith('---\n')).toBe(true);
  const end = text.indexOf('\n---\n', 4);
  expect(end).toBeGreaterThan(0);
  return text.slice(0, end);
}

function readScalar(frontmatter: string, key: string): string | null {
  for (const line of frontmatter.split('\n')) {
    const prefix = `${key}: `;
    if (line.startsWith(prefix)) {
      return line.slice(prefix.length).trim();
    }
  }
  return null;
}

describe('bad-code release homes', () => {
  it('requires every bad-code note to declare release_home', () => {
    const missingReleaseHome = badCodePaths.filter(
      (path) => !readFrontmatter(path).includes('\nrelease_home: '),
    );

    expect(missingReleaseHome).toEqual([]);
  });

  it('keeps release_home aligned with feature ownership', () => {
    const mismatches: string[] = [];

    for (const path of badCodePaths) {
      const frontmatter = readFrontmatter(path);
      const feature = readScalar(frontmatter, 'feature');
      const releaseHome = readScalar(frontmatter, 'release_home');

      if (feature === null || releaseHome === null) {
        mismatches.push(path);
        continue;
      }

      const expectedReleaseHome = releaseHomeByFeature.get(feature);
      if (expectedReleaseHome === undefined || expectedReleaseHome !== releaseHome) {
        mismatches.push(`${path} -> ${feature} => ${releaseHome}`);
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('documents the debt release-home law in the backlog readmes', () => {
    expect(backlogReadme).toContain('`bad-code/` notes also declare:');
    expect(backlogReadme).toContain('- `release_home`');
    expect(backlogReadme).toContain('Use `release_home` to answer');

    expect(badCodeReadme).toContain('## Release Homes');
    expect(badCodeReadme).toContain('`bad-code/` remains the debt ledger');
    expect(badCodeReadme).toContain('| `v17.0.0` | 104 |');
    expect(badCodeReadme).toContain('| `v19.0.0` | 9 |');
    expect(badCodeReadme).toContain('| `v20.0.0+` | 29 |');
  });
});
