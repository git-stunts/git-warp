import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const backlogRoot = `${repoRoot}docs/method/backlog/`;

const backlogNotePaths = execFileSync('git', ['ls-files', '-z', 'docs/method/backlog/**/*.md'], {
  cwd: repoRoot,
  encoding: 'utf8',
})
  .split('\0')
  .filter((path) => path.length > 0)
  .filter((path) => {
    const basename = path.split('/').at(-1);
    return basename !== 'README.md' && basename !== 'WORKLOADS.md' && basename !== 'SCORECARD.md';
  });

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
