import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// repoRoot removed — unused after readDoc refactor

function readDoc(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)), 'utf8');
}

const barrel = readDoc('index.ts');
const apertureSource = readDoc('src/domain/types/Aperture.ts');
const readme = readDoc('README.md');
const guide = readDoc('docs/GUIDE.md');

describe('Aperture is a first-class public noun', () => {
  it('exports Aperture and keeps ObserverConfig as a compatibility alias', () => {
    expect(apertureSource).toContain('export interface Aperture {');
    expect(apertureSource).toContain('export type ObserverConfig = Aperture;');
  });

  it('re-exports observer and translationCost through the barrel with Aperture-typed signatures', () => {
    expect(barrel).toContain('Observer,');
    expect(barrel).toContain('computeTranslationCost,');
  });

  it('teaches Aperture in the README glossary and observer example', () => {
    expect(readme).toContain('| **Aperture** | The boundary that shapes what an observer can see. |');
    expect(readme).toContain('| **Observer** | Filtered read-only projection through an aperture. |');
  });

  it('uses Aperture language in the guide observer walkthrough', () => {
    expect(guide).toContain('- An `Aperture` defines what is visible.');
    expect(guide).toContain('const userAperture = {');
    expect(guide).toContain("worldline.observer('public-users', userAperture)");
  });
});
