import { describe, expect, it } from 'vitest';
import MarkdownDocument from '../../helpers/MarkdownDocument.ts';

describe('0057 index-builder-on-git-cas docs shape', () => {
  it('frames the cycle in git-cas and bounded-residency terms', () => {
    const design = MarkdownDocument.fromFile('docs/design/0057-index-builder-on-git-cas.md');

    expect(design.hasHeading(1, 'Index Builder On Git-CAS')).toBe(true);
    expect(design.hasHeading(2, 'Hill')).toBe(true);
    expect(design.containsText('whole-blob reads')).toBe(true);
    expect(design.listItems()).toContain('`git-cas`-backed for content storage, and');
    expect(design.listItems()).toContain('bounded-residency throughout flush, merge, and finalize');
  });

  it('keeps the v17 release ledger focused on storage and streaming, not file-size theater', () => {
    const release = MarkdownDocument.fromFile('docs/releases/v17.0.0/README.md');

    expect(release.taskRow('INFRA_index-builder-on-git-cas')?.status).toBe('x');
    expect(release.containsText('INFRA_index-builder-on-git-cas            ← god')).toBe(false);
  });
});
