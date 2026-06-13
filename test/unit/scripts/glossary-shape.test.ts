import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import MarkdownDocument from '../../helpers/MarkdownDocument.ts';

function readDoc(relativePath: string): string {
  return fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url));
}

const glossary = MarkdownDocument.fromFile(readDoc('docs/GLOSSARY.md'));
const guide = MarkdownDocument.fromFile(readDoc('docs/GUIDE.md'));
const conceptualOverview = MarkdownDocument.fromFile(readDoc('docs/CONCEPTUAL_OVERVIEW.md'));

describe('Glossary is the canonical noun source of truth', () => {
  it('defines the status model for shipped, transition, and target nouns', () => {
    expect(glossary.hasHeading(1, 'Glossary')).toBe(true);
    expect(glossary.hasHeading(2, 'Status key')).toBe(true);
    expect(glossary.listItems().some((item) => item.startsWith('**shipped**:'))).toBe(true);
    expect(glossary.listItems().some((item) => item.startsWith('**transition**:'))).toBe(true);
    expect(glossary.listItems().some((item) => item.startsWith('**target**:'))).toBe(true);
  });

  it('records the core observer-geometry runtime nouns and working law', () => {
    const terms = glossary.tableRows().map((row) => row.cells[0]);

    expect(terms).toEqual(expect.arrayContaining([
      '`Coordinate`',
      '`Observer`',
      '`Aperture`',
      '`Optic`',
      '`Bounded support rule`',
      '`Causal index`',
      '`Support fragment`',
      '`WarpStateSnapshot`',
    ]));
    expect(glossary.hasHeading(2, 'Working law')).toBe(true);
    expect(glossary.listItems().some((item) => item.includes('**Observer**') && item.includes('**Optic**')))
      .toBe(true);
    expect(glossary.listItems().some((item) => item.includes('**bounded support rule**'))).toBe(true);
  });

  it('is pointed to by the high-traffic conceptual docs', () => {
    expect(guide.hasLink('GLOSSARY.md', 'GLOSSARY.md')).toBe(true);
    expect(conceptualOverview.hasLink('GLOSSARY.md', 'GLOSSARY.md')).toBe(true);
  });
});
