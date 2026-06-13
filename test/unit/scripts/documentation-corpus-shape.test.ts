import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import MarkdownDocument from '../../helpers/MarkdownDocument.ts';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

const readme = MarkdownDocument.fromFile(`${repoRoot}README.md`);
const docsIndex = MarkdownDocument.fromFile(`${repoRoot}docs/README.md`);
const archiveIndex = MarkdownDocument.fromFile(`${repoRoot}docs/archive/README.md`);
const styleGuide = MarkdownDocument.fromFile(`${repoRoot}.github/maintainers/documentation/style-guide.md`);
const maintainerDocsIndex = MarkdownDocument.fromFile(`${repoRoot}.github/maintainers/README.md`);

/**
 * Set of every path tracked by git, keyed by repo-relative POSIX path.
 *
 * Uses `git ls-files` rather than `existsSync`, so docs-shape assertions
 * reflect what's in the repository, not the local filesystem. This makes
 * the assertions stable against gitignored filesystem noise (e.g. macOS
 * `.DS_Store` droppings) and meaningful: "is this path tracked?" is the
 * question we actually want to answer.
 */
const trackedFiles: ReadonlySet<string> = new Set(
  execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\0')
    .filter((line) => line.length > 0),
);

/**
 * Returns true iff `relativePath` (or any path below it, for directories)
 * is tracked by git.
 */
function hasFile(relativePath: string): boolean {
  if (trackedFiles.has(relativePath)) {
    return true;
  }
  const dirPrefix = relativePath.endsWith('/') ? relativePath : `${relativePath}/`;
  for (const tracked of trackedFiles) {
    if (tracked.startsWith(dirPrefix)) {
      return true;
    }
  }
  return false;
}

describe('documentation corpus taxonomy', () => {
  it('exposes a docs index and links to it from the root README', () => {
    expect(readme.hasHeading(2, 'Documentation')).toBe(true);
    expect(hasFile('docs/GETTING_STARTED.md')).toBe(true);
    expect(hasFile('docs/API_REFERENCE.md')).toBe(true);
    expect(hasFile('docs/ADVANCED_GUIDE.md')).toBe(true);
    expect(hasFile('docs/ARCHITECTURE.md')).toBe(true);
    expect(hasFile('docs/ROADMAP.md')).toBe(true);
    expect(hasFile('ARCHITECTURE.md')).toBe(false);
    expect(hasFile('ROADMAP.md')).toBe(false);
    expect(hasFile('docs/archive/adr/ADR-0004-folds.md')).toBe(true);
    expect(hasFile('adr/ADR-0004-folds.md')).toBe(false);
    expect(hasFile('docs/ADR-001-Folds.md')).toBe(false);
    expect(hasFile('examples')).toBe(false);
    expect(hasFile('GRAVEYARD.md')).toBe(false);
    expect(docsIndex.hasHeading(1, 'Documentation Index')).toBe(true);
    expect(docsIndex.hasLink('Getting Started', 'GETTING_STARTED.md')).toBe(true);
    expect(docsIndex.hasLink('Guide', 'GUIDE.md')).toBe(true);
    expect(docsIndex.hasLink('API Reference', 'API_REFERENCE.md')).toBe(true);
    expect(docsIndex.hasLink('Advanced Guide', 'ADVANCED_GUIDE.md')).toBe(true);
    expect(docsIndex.hasLink('CLI Guide', 'CLI_GUIDE.md')).toBe(true);
    expect(docsIndex.hasLink('Conceptual Overview', 'CONCEPTUAL_OVERVIEW.md')).toBe(true);
    expect(docsIndex.hasLink('Architecture', 'ARCHITECTURE.md')).toBe(true);
    expect(docsIndex.hasLink('Roadmap', 'ROADMAP.md')).toBe(true);
    expect(docsIndex.hasHeading(2, 'Current Release-Blocker Docs')).toBe(false);
  });

  it('keeps a maintainer-facing documentation guide for writing and information architecture', () => {
    expect(docsIndex.hasLink('Maintainer docs', '../.github/maintainers/README.md')).toBe(true);
    expect(docsIndex.hasLink(
      'Documentation style guide',
      '../.github/maintainers/documentation/style-guide.md',
    )).toBe(true);
    expect(maintainerDocsIndex.hasHeading(1, 'Maintainer docs')).toBe(true);
    expect(maintainerDocsIndex.hasLink('Documentation style guide', 'documentation/style-guide.md')).toBe(true);
    expect(styleGuide.hasHeading(1, 'Documentation style guide')).toBe(true);
    expect(styleGuide.hasHeading(2, 'Writing principles')).toBe(true);
    expect(styleGuide.hasHeading(2, 'Audience model')).toBe(true);
    expect(styleGuide.hasHeading(2, 'Target information architecture')).toBe(true);
  });

  it('keeps an explicit archive index', () => {
    expect(archiveIndex.hasHeading(1, 'Archive Index')).toBe(true);
    expect(archiveIndex.hasLink('archived backlog notes', 'backlog/README.md')).toBe(true);
    expect(archiveIndex.hasLink('archived architectural decision records', 'adr/README.md')).toBe(true);
    expect(archiveIndex.hasLink('../README.md', '../README.md')).toBe(true);
  });

  it('moves obvious historical clutter out of top-level docs', () => {
    expect(hasFile('docs/HEX_AUDIT.convo.txt')).toBe(false);
    expect(hasFile('docs/M10_SENTINEL_PLAN.md')).toBe(false);
    expect(hasFile('docs/TYPESCRIPT_ZERO.md')).toBe(false);
    expect(hasFile('docs/TRUST_MIGRATION.md')).toBe(false);
    expect(hasFile('docs/TRUST_OPERATOR_RUNBOOK.md')).toBe(false);
    expect(hasFile('docs/.DS_Store')).toBe(false);

    expect(hasFile('docs/archive/audits/HEX_AUDIT.convo.txt')).toBe(true);
    expect(hasFile('docs/archive/plans/M10_SENTINEL_PLAN.md')).toBe(true);
    expect(hasFile('docs/archive/checklists/TYPESCRIPT_ZERO.md')).toBe(true);
    expect(hasFile('docs/trust/TRUST_MIGRATION.md')).toBe(true);
    expect(hasFile('docs/trust/TRUST_OPERATOR_RUNBOOK.md')).toBe(true);
    expect(hasFile('docs/archive/STRANDS.md')).toBe(false);
    expect(hasFile('docs/archive/TTD.md')).toBe(false);
  });

  it('keeps superseded plans under docs/archive instead of the live docs surface', () => {
    expect(hasFile('docs/plans/conflict-analyzer-v1.md')).toBe(false);
    expect(hasFile('docs/archive/plans/conflict-analyzer-v1.md')).toBe(true);
    expect(hasFile('docs/archive/plans/counterfactuals-draft-v1.md')).toBe(true);
    expect(hasFile('docs/archive/plans/counterfactuals-draft-v2.md')).toBe(true);
  });
});
