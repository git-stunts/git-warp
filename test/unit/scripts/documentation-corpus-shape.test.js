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
  fileURLToPath(new URL('../../../docs/dev/documentation/style-guide.md', import.meta.url)),
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
    expect(readme).toContain('**[Documentation Index](docs/README.md)**');
    expect(docsIndex).toContain('# Documentation Index');
    expect(docsIndex).toContain('[Guide](GUIDE.md)');
    expect(docsIndex).toContain('[CLI Guide](CLI_GUIDE.md)');
    expect(docsIndex).toContain('[Strands](STRANDS.md)');
    expect(docsIndex).toContain('[TTD](TTD.md)');
  });

  it('keeps a maintainer-facing documentation guide for writing and information architecture', () => {
    expect(docsIndex).toContain('[Documentation style guide](dev/documentation/style-guide.md)');
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
  });

  it('keeps superseded plans under docs/archive instead of the live docs surface', () => {
    expect(hasFile('docs/plans/conflict-analyzer-v1.md')).toBe(false);
    expect(hasFile('docs/archive/plans/conflict-analyzer-v1.md')).toBe(true);
    expect(hasFile('docs/archive/plans/counterfactuals-draft-v1.md')).toBe(true);
    expect(hasFile('docs/archive/plans/counterfactuals-draft-v2.md')).toBe(true);
  });
});
