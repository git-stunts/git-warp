import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import MarkdownDocument from '../../helpers/MarkdownDocument.ts';

function readDoc(relativePath: string): MarkdownDocument {
  return MarkdownDocument.fromFile(fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)));
}

const readme = readDoc('README.md');
const guide = readDoc('docs/GUIDE.md');
const advancedGuide = readDoc('docs/ADVANCED_GUIDE.md');
const drift = readDoc('docs/audits/WARP_DRIFT.md');
const alignment = readDoc('docs/audits/WARP_DOCTRINE_RUNTIME_ALIGNMENT.md');

describe('WARP doctrine/runtime teaching alignment', () => {
  it('keeps entry-point docs connected to the glossary and ratchet', () => {
    expect(readme.hasHeading(2, 'Runtime posture')).toBe(true);
    expect(readme.hasLink('GLOSSARY.md', 'docs/GLOSSARY.md')).toBe(true);
    expect(readme.hasLink(
      'Doctrine/runtime Alignment Ratchet',
      'docs/DOCTRINE_RUNTIME_ALIGNMENT.md',
    )).toBe(true);

    expect(guide.hasHeading(2, 'Runtime posture')).toBe(true);
    expect(guide.hasLink('GLOSSARY.md', 'GLOSSARY.md')).toBe(true);
    expect(guide.hasLink(
      'Doctrine/runtime Alignment Ratchet',
      'DOCTRINE_RUNTIME_ALIGNMENT.md',
    )).toBe(true);

    expect(advancedGuide.hasHeading(2, 'Runtime posture')).toBe(true);
    expect(advancedGuide.hasLink('GLOSSARY.md', 'GLOSSARY.md')).toBe(true);
    expect(advancedGuide.hasLink(
      'Doctrine/runtime Alignment Ratchet',
      'DOCTRINE_RUNTIME_ALIGNMENT.md',
    )).toBe(true);
  });

  it('marks current teaching surfaces with shipped, transition, and target posture', () => {
    for (const doc of [readme, guide, advancedGuide]) {
      expect(doc.containsText('target doctrine')).toBe(true);
    }

    expect(readme.containsText('shipped, transition, and target noun status')).toBe(true);
    expect(guide.containsText('shipped and transition APIs')).toBe(true);
    expect(advancedGuide.containsText('implementation')).toBe(true);
    expect(advancedGuide.containsText('posture')).toBe(true);
  });

  it('pins active reconciliation hills to GitHub issues', () => {
    expect(alignment.hasHeading(1, 'WARP doctrine/runtime teaching alignment')).toBe(true);
    expect(alignment.hasHeading(2, 'Teaching surface matrix')).toBe(true);
    expect(alignment.hasHeading(2, 'Active reconciliation hills')).toBe(true);

    for (const issueNumber of ['554', '557', '558', '559', '560', '561', '562', '563', '564']) {
      expect(alignment.containsText(`github.com/git-stunts/git-warp/issues/${issueNumber}`)).toBe(true);
    }
  });

  it('keeps the drift ledger connected to the teaching alignment audit', () => {
    expect(drift.hasLink(
      'WARP doctrine/runtime teaching alignment',
      'WARP_DOCTRINE_RUNTIME_ALIGNMENT.md',
    )).toBe(true);
  });
});
