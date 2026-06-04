import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import migrationEvidence from '../../../docs/method/github-issue-migration-2026-06-01.json' with { type: 'json' };

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const backlogRoot = `${repoRoot}docs/method/backlog/`;
const archivedBacklogRoot = `${repoRoot}docs/archive/backlog/github-issue-migration-2026-06-01/docs/method/backlog/`;
const archivedBacklogRelativeRoot =
  'docs/archive/backlog/github-issue-migration-2026-06-01/docs/method/backlog/';

type BacklogNote = {
  readonly path: string;
  readonly lane: string;
  readonly feature: string | null;
};

type MarkdownTable = {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
};

type MigrationIssue = typeof migrationEvidence.issues[number];

function listBacklogNotes(dir: string): readonly string[] {
  const paths: string[] = [];
  const supportDocs = new Set(['README.md', 'WORKLOADS.md', 'SCORECARD.md', 'RELEASE_TRIAGE.md']);

  for (const name of readdirSync(dir)) {
    const absolutePath = `${dir}${name}`;
    if (statSync(absolutePath).isDirectory()) {
      paths.push(...listBacklogNotes(`${absolutePath}/`));
      continue;
    }
    if (!name.endsWith('.md')) {
      continue;
    }
    if (supportDocs.has(name)) {
      continue;
    }
    paths.push(absolutePath.slice(repoRoot.length));
  }

  return paths;
}

function listMarkdownFiles(dir: string): readonly string[] {
  const paths: string[] = [];

  for (const name of readdirSync(dir)) {
    const absolutePath = `${dir}${name}`;
    if (statSync(absolutePath).isDirectory()) {
      paths.push(...listMarkdownFiles(`${absolutePath}/`));
      continue;
    }
    if (name.endsWith('.md')) {
      paths.push(absolutePath.slice(repoRoot.length));
    }
  }

  return paths;
}

const archivedBacklogNotePaths = listBacklogNotes(archivedBacklogRoot);
const archivedMarkdownPaths = listMarkdownFiles(archivedBacklogRoot);
const archivedBacklogNotes = archivedBacklogNotePaths.map((path) => ({
  path,
  lane: laneFromArchivedPath(path),
  feature: readScalar(readFrontmatter(path), 'feature'),
}));

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

function laneFromArchivedPath(path: string): string {
  expect(path.startsWith(archivedBacklogRelativeRoot)).toBe(true);
  const relativePath = path.slice(archivedBacklogRelativeRoot.length);
  const firstSegment = relativePath.split('/')[0];
  if (firstSegment === undefined) {
    throw new Error(`Cannot derive backlog lane from ${path}`);
  }
  if (relativePath.includes('/')) {
    return firstSegment;
  }
  return 'backlog-root';
}

function migrationIssueForArchivedPath(path: string): MigrationIssue {
  const issue = migrationEvidence.issues.find((candidate) => candidate.archived === path);
  if (issue === undefined) {
    throw new Error(`Missing migration evidence for ${path}`);
  }
  return issue;
}

function featureLabels(issue: MigrationIssue): readonly string[] {
  return issue.labels.filter((label) => label.startsWith('feature:'));
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

function countByMetric(table: MarkdownTable, metric: string): number {
  const metricColumn = table.header.indexOf('Metric');
  const countColumn = table.header.indexOf('Count');
  expect(metricColumn).toBeGreaterThanOrEqual(0);
  expect(countColumn).toBeGreaterThanOrEqual(0);

  const row = table.rows.find((candidate) => candidate[metricColumn] === metric);
  if (row === undefined) {
    throw new Error(`Missing migration summary metric ${metric}`);
  }
  const countCell = row[countColumn];
  if (countCell === undefined) {
    throw new Error(`Missing count for migration summary metric ${metric}`);
  }
  expect(countCell).toMatch(/^\d+$/u);
  const count = Number(countCell);
  expect(Number.isSafeInteger(count)).toBe(true);
  return count;
}

describe('backlog feature scope', () => {
  it('archives every migrated backlog note outside inbox with a feature scope', () => {
    const missingFeatureOutsideInbox = archivedBacklogNotes
      .filter((note) => note.lane !== 'inbox')
      .filter((note) => note.feature === null)
      .map((note) => note.path);

    expect(missingFeatureOutsideInbox).toEqual([]);
  });

  it('keeps inbox captures as the only intentionally unscoped migrated lane', () => {
    const missingFeatureNotes = archivedBacklogNotes.filter((note) => note.feature === null);

    expect(missingFeatureNotes.length).toBeGreaterThan(0);
    expect(missingFeatureNotes.every((note) => note.lane === 'inbox')).toBe(true);
  });

  it('labels migrated issues with their feature scope from frontmatter', () => {
    const featureLabelViolations = archivedBacklogNotes.flatMap((note) => {
      const issue = migrationIssueForArchivedPath(note.path);
      const labels = featureLabels(issue);
      if (note.feature === null) {
        return labels.length === 0 ? [] : [`${note.path} -> ${labels.join(', ')}`];
      }

      const expectedLabel = `feature:${note.feature}`;
      return labels.includes(expectedLabel)
        ? []
        : [`${note.path} expected ${expectedLabel} but found ${labels.join(', ')}`];
    });

    expect(featureLabelViolations).toEqual([]);
  });

  it('labels migrated issues with their source backlog lane', () => {
    const laneLabelViolations = archivedBacklogNotes.flatMap((note) => {
      const issue = migrationIssueForArchivedPath(note.path);
      const expectedLabel = `lane:${note.lane}`;
      return issue.labels.includes(expectedLabel)
        ? []
        : [`${note.path} expected ${expectedLabel}`];
    });

    expect(laneLabelViolations).toEqual([]);
  });

  it('publishes migration summary metrics from the migration evidence', () => {
    const backlogReadme = readFileSync(`${backlogRoot}README.md`, 'utf8');
    const migrationSummary = parseMarkdownTable(backlogReadme, 'Migration Summary');

    expect(countByMetric(migrationSummary, 'Backlog cards imported as GitHub Issues'))
      .toBe(migrationEvidence.cards);
    expect(countByMetric(migrationSummary, 'GitHub Issues created in migration'))
      .toBe(migrationEvidence.created);
    expect(countByMetric(migrationSummary, 'Existing source-path issues skipped'))
      .toBe(migrationEvidence.skipped);
    expect(countByMetric(migrationSummary, 'Archived backlog files'))
      .toBe(archivedMarkdownPaths.length);
  });
});
