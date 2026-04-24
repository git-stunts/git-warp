import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const backlogRoot = `${repoRoot}docs/method/backlog/`;

function listBacklogNotes(dir: string): string[] {
  const paths: string[] = [];

  for (const name of readdirSync(dir)) {
    const absolutePath = `${dir}${name}`;
    if (statSync(absolutePath).isDirectory()) {
      paths.push(...listBacklogNotes(`${absolutePath}/`));
      continue;
    }
    if (!name.endsWith('.md')) {
      continue;
    }
    if (name === 'README.md' || name === 'WORKLOADS.md' || name === 'SCORECARD.md') {
      continue;
    }
    paths.push(absolutePath.slice(repoRoot.length));
  }

  return paths;
}

const backlogNotePaths = listBacklogNotes(backlogRoot);

function readFrontmatter(path: string): string {
  const text = readFileSync(`${repoRoot}${path}`, 'utf8');
  expect(text.startsWith('---\n')).toBe(true);
  const end = text.indexOf('\n---\n', 4);
  expect(end).toBeGreaterThan(0);
  return text.slice(0, end);
}

describe('backlog feature scope', () => {
  it('requires every live backlog note outside inbox to declare a feature', () => {
    const missingFeatureOutsideInbox = backlogNotePaths.filter((path) => {
      if (path.startsWith('docs/method/backlog/inbox/')) {
        return false;
      }
      return !readFrontmatter(path).includes('\nfeature: ');
    });

    expect(missingFeatureOutsideInbox).toEqual([]);
  });

  it('keeps inbox captures as the only intentionally unscoped lane', () => {
    const missingFeaturePaths = backlogNotePaths.filter(
      (path) => !readFrontmatter(path).includes('\nfeature: '),
    );

    expect(missingFeaturePaths.length).toBeGreaterThan(0);
    expect(missingFeaturePaths.every((path) => path.startsWith('docs/method/backlog/inbox/'))).toBe(
      true,
    );
  });

  it('documents the feature-scope law in the backlog readme', () => {
    const backlogReadme = readFileSync(`${backlogRoot}README.md`, 'utf8');

    expect(backlogReadme).toContain('Every live note outside `inbox/` now also declares:');
    expect(backlogReadme).toContain('- `inbox/` remains intentionally unscoped until triage or promotion');
  });
});
