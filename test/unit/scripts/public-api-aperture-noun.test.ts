import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// repoRoot removed — unused after readDoc refactor

function readDoc(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)), 'utf8');
}

const dts = readDoc('index.d.ts');
const readme = readDoc('README.md');
const guide = readDoc('docs/GUIDE.md');

describe('Aperture is a first-class public noun', () => {
  it('exports Aperture and keeps ObserverConfig as a compatibility alias', () => {
    expect(dts).toContain('export interface Aperture {');
    expect(dts).toContain('export type ObserverConfig = Aperture;');
    expect(dts).toMatch(/observer\(config: Aperture\): Promise<Observer>;/);
    expect(dts).toMatch(/translationCost\(configA: Aperture, configB: Aperture\): Promise<TranslationCostResult>;/);
  });

  it('teaches Aperture in the README glossary and observer example', () => {
    expect(readme).toContain('| **Aperture** | The aperture definition that shapes what an observer can see. |');
    expect(readme).toContain('| **Observer** | A filtered, read-only projection over a worldline through an aperture. |');
  });

  it('uses Aperture language in the guide observer walkthrough', () => {
    expect(guide).toContain('- An `Aperture` defines what is visible.');
    expect(guide).toContain('const userAperture = {');
    expect(guide).toContain("worldline.observer('public-users', userAperture)");
  });
});
