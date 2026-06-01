import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const backlogReadme = readFileSync(`${repoRoot}docs/method/backlog/README.md`, 'utf8');
const archivedBacklogRoot =
  'docs/archive/backlog/github-issue-migration-2026-06-01/docs/method/backlog/';
const badCodeRoot = `${archivedBacklogRoot}bad-code/`;
const badCodeReadme = readFileSync(`${repoRoot}${badCodeRoot}README.md`, 'utf8');
const badCodeReleaseTriage = readFileSync(`${repoRoot}${badCodeRoot}RELEASE_TRIAGE.md`, 'utf8');

const badCodePaths = readdirSync(`${repoRoot}${badCodeRoot}`)
  .filter((name) => name.endsWith('.md'))
  .filter((name) => name !== 'README.md')
  .filter((name) => name !== 'RELEASE_TRIAGE.md')
  .map((name) => `${badCodeRoot}${name}`);

const expectedReleaseHomes = new Set(['v17.0.0', 'v18.0.0', 'v19.0.0', 'v20.0.0', 'v21.0.0']);

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

function countReleaseHomes(): Map<string, number> {
  const counts = new Map<string, number>();

  for (const path of badCodePaths) {
    const releaseHome = readScalar(readFrontmatter(path), 'release_home');

    if (releaseHome === null) {
      continue;
    }

    const previousCount = counts.get(releaseHome);
    counts.set(releaseHome, previousCount === undefined ? 1 : previousCount + 1);
  }

  return counts;
}

describe('bad-code release homes', () => {
  it('requires every bad-code note to declare release_home', () => {
    const missingReleaseHome = badCodePaths.filter(
      (path) => !readFrontmatter(path).includes('\nrelease_home: ')
    );

    expect(missingReleaseHome).toEqual([]);
  });

  it('keeps release_home values on current release lanes', () => {
    const invalidReleaseHomes: string[] = [];

    for (const path of badCodePaths) {
      const frontmatter = readFrontmatter(path);
      const releaseHome = readScalar(frontmatter, 'release_home');

      if (releaseHome === null) {
        invalidReleaseHomes.push(path);
        continue;
      }

      if (!expectedReleaseHomes.has(releaseHome)) {
        invalidReleaseHomes.push(`${path} -> ${releaseHome}`);
      }
    }

    expect(invalidReleaseHomes).toEqual([]);
  });

  it('documents the debt release-home law in the backlog readmes', () => {
    expect(backlogReadme).toContain('GitHub Issues are now the live Method work tracker');
    expect(backlogReadme).toContain('bad-code lane');

    expect(badCodeReadme).toContain('## Release Homes');
    expect(badCodeReadme).toContain('`bad-code/` remains the debt ledger');
    expect(badCodeReleaseTriage).toContain('## Current Metadata Snapshot');
    expect(badCodeReleaseTriage).toContain(
      'There should be no remaining `release_home: v20.0.0+` values.'
    );

    for (const [releaseHome, count] of countReleaseHomes()) {
      const countRow = `| \`${releaseHome}\` | ${count} |`;

      expect(badCodeReadme).toContain(countRow);
      expect(badCodeReleaseTriage).toContain(countRow);
    }

    expect(badCodeReadme).not.toContain('`v20.0.0+`');
  });
});
