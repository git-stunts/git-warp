import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readme = readFileSync(
  fileURLToPath(new URL('../../../README.md', import.meta.url)),
  'utf8',
);
const docsIndex = readFileSync(
  fileURLToPath(new URL('../../../docs/README.md', import.meta.url)),
  'utf8',
);
const archiveIndex = readFileSync(
  fileURLToPath(new URL('../../../docs/archive/README.md', import.meta.url)),
  'utf8',
);
const styleGuide = readFileSync(
  fileURLToPath(new URL('../../../.github/maintainers/documentation/style-guide.md', import.meta.url)),
  'utf8',
);
const maintainerDocsIndex = readFileSync(
  fileURLToPath(new URL('../../../.github/maintainers/README.md', import.meta.url)),
  'utf8',
);

/**
 * @param {string} relativePath
 * @returns {boolean}
 */
function hasFile(relativePath) {
  return existsSync(fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)));
}

describe('documentation corpus taxonomy', () => {
  it('exposes a docs index and links to it from the root README', () => {
    expect(readme).toContain('**[Documentation index](https://github.com/git-stunts/git-warp/blob/main/docs/README.md)**');
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
