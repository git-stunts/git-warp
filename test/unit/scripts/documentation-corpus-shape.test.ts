import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

const readme = readFileSync(`${repoRoot}README.md`, 'utf8');
const docsIndex = readFileSync(`${repoRoot}docs/README.md`, 'utf8');
const archiveIndex = readFileSync(`${repoRoot}docs/archive/README.md`, 'utf8');
const styleGuide = readFileSync(
  `${repoRoot}.github/maintainers/documentation/style-guide.md`,
  'utf8',
);
const maintainerDocsIndex = readFileSync(
  `${repoRoot}.github/maintainers/README.md`,
  'utf8',
);

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
    expect(readme).toContain('## Documentation');
    expect(hasFile('docs/GETTING_STARTED.md')).toBe(true);
    expect(hasFile('docs/API_REFERENCE.md')).toBe(true);
    expect(hasFile('docs/ADVANCED_GUIDE.md')).toBe(true);
    expect(hasFile('docs/ARCHITECTURE.md')).toBe(true);
    expect(hasFile('docs/ROADMAP.md')).toBe(true);
    expect(hasFile('ARCHITECTURE.md')).toBe(false);
    expect(hasFile('ROADMAP.md')).toBe(false);
    expect(hasFile('adr/ADR-0004-folds.md')).toBe(true);
    expect(hasFile('docs/ADR-001-Folds.md')).toBe(false);
    expect(hasFile('examples')).toBe(false);
    expect(hasFile('GRAVEYARD.md')).toBe(false);
    expect(docsIndex).toContain('# Documentation Index');
    expect(docsIndex).toContain('[Getting Started](GETTING_STARTED.md)');
    expect(docsIndex).toContain('[Guide](GUIDE.md)');
    expect(docsIndex).toContain('[API Reference](API_REFERENCE.md)');
    expect(docsIndex).toContain('[Advanced Guide](ADVANCED_GUIDE.md)');
    expect(docsIndex).toContain('[CLI Guide](CLI_GUIDE.md)');
    expect(docsIndex).toContain('[Conceptual Overview](CONCEPTUAL_OVERVIEW.md)');
    expect(docsIndex).toContain('[Architecture](ARCHITECTURE.md)');
    expect(docsIndex).toContain('[Roadmap](ROADMAP.md)');
    expect(docsIndex).not.toContain('## Current Release-Blocker Docs');
  });

  it('keeps a maintainer-facing documentation guide for writing and information architecture', () => {
    expect(docsIndex).toContain('[Maintainer docs](../.github/maintainers/README.md)');
    expect(docsIndex).toContain('[Documentation style guide](../.github/maintainers/documentation/style-guide.md)');
    expect(maintainerDocsIndex).toContain('# Maintainer docs');
    expect(maintainerDocsIndex).toContain('[Documentation style guide](documentation/style-guide.md)');
    expect(styleGuide).toContain('# Documentation style guide');
    expect(styleGuide).toContain('## Writing principles');
    expect(styleGuide).toContain('## Audience model');
    expect(styleGuide).toContain('## Target information architecture');
  });

  it('keeps an explicit archive index', () => {
    expect(archiveIndex).toContain('# Archive Index');
    expect(archiveIndex).toContain('should not be treated as the canonical current docs set');
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
