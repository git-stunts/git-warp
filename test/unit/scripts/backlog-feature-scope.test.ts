import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const backlogRoot = `${repoRoot}docs/method/backlog/`;
const archivedBacklogRoot = `${repoRoot}docs/archive/backlog/github-issue-migration-2026-06-01/docs/method/backlog/`;
const archivedBacklogRelativeRoot =
  'docs/archive/backlog/github-issue-migration-2026-06-01/docs/method/backlog/';

function listBacklogNotes(dir: string): string[] {
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

const archivedBacklogNotePaths = listBacklogNotes(archivedBacklogRoot);

function readFrontmatter(path: string): string {
  const text = readFileSync(`${repoRoot}${path}`, 'utf8');
  expect(text.startsWith('---\n')).toBe(true);
  const end = text.indexOf('\n---\n', 4);
  expect(end).toBeGreaterThan(0);
  return text.slice(0, end);
}

describe('backlog feature scope', () => {
  it('archives every migrated backlog note outside inbox with a feature scope', () => {
    const missingFeatureOutsideInbox = archivedBacklogNotePaths.filter((path) => {
      if (path.startsWith(`${archivedBacklogRelativeRoot}inbox/`)) {
        return false;
      }
      return !readFrontmatter(path).includes('\nfeature: ');
    });

    expect(missingFeatureOutsideInbox).toEqual([]);
  });

  it('keeps inbox captures as the only intentionally unscoped migrated lane', () => {
    const missingFeaturePaths = archivedBacklogNotePaths.filter(
      (path) => !readFrontmatter(path).includes('\nfeature: ')
    );

    expect(missingFeaturePaths.length).toBeGreaterThan(0);
    expect(
      missingFeaturePaths.every((path) => path.startsWith(`${archivedBacklogRelativeRoot}inbox/`))
    ).toBe(true);
  });

  it('documents the GitHub Issues tracker handoff in the backlog readme', () => {
    const backlogReadme = readFileSync(`${backlogRoot}README.md`, 'utf8');

    expect(backlogReadme).toContain('GitHub Issues are now the live Method work tracker');
    expect(backlogReadme).toContain(
      'Do not add new live work cards under `docs/method/backlog/**`'
    );
    expect(backlogReadme).toContain('as GitHub Issues and link issue URLs');
  });

  it('documents the migrated issue metadata table shape', () => {
    const backlogReadme = readFileSync(`${backlogRoot}README.md`, 'utf8');

    expect(backlogReadme).toContain('Markdown provenance table');
    expect(backlogReadme).toContain('`| Field | Value |`');
    expect(backlogReadme).toContain('`| Source backlog |');
    expect(backlogReadme).not.toContain('`Source backlog: ...`');
  });
});
