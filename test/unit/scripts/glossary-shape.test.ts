import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readDoc(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)), 'utf8');
}

const glossary = readDoc('docs/GLOSSARY.md');
const guide = readDoc('docs/GUIDE.md');
const conceptualOverview = readDoc('docs/CONCEPTUAL_OVERVIEW.md');

describe('Glossary is the canonical noun source of truth', () => {
  it('defines the status model for shipped, transition, and target nouns', () => {
    expect(glossary).toContain('# Glossary');
    expect(glossary).toContain('This is the canonical noun source of truth for `git-warp`.');
    expect(glossary).toContain('- **shipped**: current repo/runtime truth');
    expect(glossary).toContain('- **transition**: the repo uses this noun, but the implementation shape is');
    expect(glossary).toContain('- **target**: the noun is part of the intended architecture');
  });

  it('records the core observer-geometry runtime nouns and working law', () => {
    expect(glossary).toContain('| `Coordinate` |');
    expect(glossary).toContain('| `Observer` |');
    expect(glossary).toContain('| `Aperture` |');
    expect(glossary).toContain('| `Optic` |');
    expect(glossary).toContain('| `Bounded support rule` |');
    expect(glossary).toContain('| `Causal index` |');
    expect(glossary).toContain('| `Support fragment` |');
    expect(glossary).toContain('| `WarpStateSnapshot` |');
    expect(glossary).toContain('## Working law');
    expect(glossary).toContain('1. An app asks an **Observer** to answer an **Optic**.');
    expect(glossary).toContain('3. The runtime derives the **bounded support rule**');
  });

  it('is pointed to by the high-traffic conceptual docs', () => {
    expect(guide).toContain('[GLOSSARY.md](GLOSSARY.md)');
    expect(conceptualOverview).toContain('[GLOSSARY.md](GLOSSARY.md)');
  });
});
