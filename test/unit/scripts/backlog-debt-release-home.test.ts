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

const expectedReleaseHomes = new Set([
  'v17.0.0',
  'v18.0.0',
  'v19.0.0',
  'v20.0.0',
  'v21.0.0',
]);

type ReleaseHomeCount = {
  readonly releaseHome: string;
  readonly count: number;
};

type MarkdownTable = {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
};

type MarkdownLink = {
  readonly label: string;
  readonly href: string;
};

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

function countReleaseHomes(): readonly ReleaseHomeCount[] {
  const counts = new Map<string, number>();

  for (const path of badCodePaths) {
    const releaseHome = readScalar(readFrontmatter(path), 'release_home');

    if (releaseHome === null) {
      continue;
    }

    const previousCount = counts.get(releaseHome);
    counts.set(releaseHome, previousCount === undefined ? 1 : previousCount + 1);
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([releaseHome, count]) => ({ releaseHome, count }));
}

function sectionLines(markdown: string, headingText: string): readonly string[] {
  const lines = markdown.split('\n');
  const headingIndex = lines.findIndex((line) => {
    const match = /^(#{1,6}) (.+)$/u.exec(line);
    return match?.[2] === headingText;
  });
  expect(headingIndex, `Missing heading ${headingText}`).toBeGreaterThanOrEqual(0);

  const headingLine = lines[headingIndex];
  if (headingLine === undefined) {
    throw new Error(`Missing heading line for ${headingText}`);
  }
  const headingMatch = /^(#{1,6}) /u.exec(headingLine);
  const headingMarker = headingMatch?.[1];
  if (headingMarker === undefined) {
    throw new Error(`Malformed heading line for ${headingText}`);
  }

  const section: string[] = [];
  for (const line of lines.slice(headingIndex + 1)) {
    const nextHeadingMatch = /^(#{1,6}) /u.exec(line);
    const nextHeadingMarker = nextHeadingMatch?.[1];
    if (nextHeadingMarker !== undefined && nextHeadingMarker.length <= headingMarker.length) {
      break;
    }
    section.push(line);
  }

  return section;
}

function parseMarkdownTable(markdown: string, headingText: string): MarkdownTable {
  const lines = sectionLines(markdown, headingText);
  const tableStart = lines.findIndex((line) => line.trim().startsWith('|'));
  expect(tableStart, `Missing table under ${headingText}`).toBeGreaterThanOrEqual(0);

  const headerLine = lines[tableStart];
  const separatorLine = lines[tableStart + 1];
  if (headerLine === undefined || separatorLine === undefined) {
    throw new Error(`Incomplete table under ${headingText}`);
  }

  const header = markdownTableCells(headerLine);
  const separator = markdownTableCells(separatorLine);
  expect(separator).toHaveLength(header.length);
  expect(separator.every((cell) => /^-+:?$/u.test(cell))).toBe(true);

  const rows: string[][] = [];
  for (const line of lines.slice(tableStart + 2)) {
    if (!line.trim().startsWith('|')) {
      break;
    }
    const cells = markdownTableCells(line);
    expect(cells).toHaveLength(header.length);
    rows.push(cells);
  }

  return { header, rows };
}

function markdownTableCells(line: string): string[] {
  const trimmed = line.trim();
  expect(trimmed.startsWith('|')).toBe(true);
  expect(trimmed.endsWith('|')).toBe(true);
  return trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
}

function releaseHomeCountsFromTable(table: MarkdownTable): readonly ReleaseHomeCount[] {
  const releaseHomeColumn = table.header.indexOf('Release Home');
  const countColumn = table.header.indexOf('Count');
  expect(releaseHomeColumn).toBeGreaterThanOrEqual(0);
  expect(countColumn).toBeGreaterThanOrEqual(0);

  return table.rows
    .map((row) => {
      const releaseHomeCell = row[releaseHomeColumn];
      const countCell = row[countColumn];
      if (releaseHomeCell === undefined || countCell === undefined) {
        throw new Error('Release-home table row is missing required cells');
      }
      return {
        releaseHome: unquoteCodeCell(releaseHomeCell),
        count: parseCountCell(countCell),
      };
    })
    .sort((left, right) => left.releaseHome.localeCompare(right.releaseHome));
}

function unquoteCodeCell(cell: string): string {
  const match = /^`([^`]+)`$/u.exec(cell);
  if (match === null) {
    return cell;
  }
  const value = match[1];
  if (value === undefined) {
    throw new Error(`Malformed code cell ${cell}`);
  }
  return value;
}

function parseCountCell(cell: string): number {
  expect(cell).toMatch(/^\d+$/u);
  const count = Number(cell);
  expect(Number.isSafeInteger(count)).toBe(true);
  return count;
}

function linksInSection(markdown: string, headingText: string): readonly MarkdownLink[] {
  return sectionLines(markdown, headingText).flatMap((line) => {
    const match = /^- \[([^\]]+)\]\(([^)]+)\)$/u.exec(line);
    if (match === null) {
      return [];
    }
    const label = match[1];
    const href = match[2];
    if (label === undefined || href === undefined) {
      return [];
    }
    return [{ label, href }];
  });
}

describe('bad-code release homes', () => {
  it('requires every bad-code note to declare release_home', () => {
    const missingReleaseHome = badCodePaths.filter(
      (path) => readScalar(readFrontmatter(path), 'release_home') === null,
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

  it('publishes computed release-home counts as structured tables', () => {
    const computedCounts = countReleaseHomes();

    expect(releaseHomeCountsFromTable(
      parseMarkdownTable(badCodeReadme, 'Release Homes'),
    )).toEqual(computedCounts);
    expect(releaseHomeCountsFromTable(
      parseMarkdownTable(badCodeReleaseTriage, 'Current Metadata Snapshot'),
    )).toEqual(computedCounts);
  });

  it('points live backlog lane links at GitHub issue queries', () => {
    expect(linksInSection(backlogReadme, 'Current Tracker')).toEqual([
      {
        label: 'all open issues',
        href: 'https://github.com/git-stunts/git-warp/issues',
      },
      {
        label: 'v18 lane',
        href: 'https://github.com/git-stunts/git-warp/issues?q=is%3Aissue%20is%3Aopen%20label%3Alane%3Av18.0.0',
      },
      {
        label: 'bad-code lane',
        href: 'https://github.com/git-stunts/git-warp/issues?q=is%3Aissue%20is%3Aopen%20label%3Alane%3Abad-code',
      },
      {
        label: 'inbox lane',
        href: 'https://github.com/git-stunts/git-warp/issues?q=is%3Aissue%20is%3Aopen%20label%3Alane%3Ainbox',
      },
    ]);
  });
});
