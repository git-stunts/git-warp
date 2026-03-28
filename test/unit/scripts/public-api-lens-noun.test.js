import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * @param {string} relativePath
 * @returns {string}
 */
function readDoc(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)), 'utf8');
}

const dts = readDoc('index.d.ts');
const readme = readDoc('README.md');
const guide = readDoc('docs/GUIDE.md');

describe('Lens is a first-class public noun', () => {
  it('exports Lens and keeps ObserverConfig as a compatibility alias', () => {
    expect(dts).toContain('export interface Lens {');
    expect(dts).toContain('export type ObserverConfig = Lens;');
    expect(dts).toMatch(/observer\(config: Lens\): Promise<Observer>;/);
    expect(dts).toMatch(/translationCost\(configA: Lens, configB: Lens\): Promise<TranslationCostResult>;/);
  });

  it('teaches Lens in the README glossary and observer example', () => {
    expect(readme).toContain('| **Lens** | The aperture definition that shapes what an observer can see. |');
    expect(readme).toContain('| **Observer** | A filtered, read-only projection over a worldline through a lens. |');
  });

  it('uses Lens language in the guide observer walkthrough', () => {
    expect(guide).toContain('- A `Lens` defines what is visible.');
    expect(guide).toContain('const userLens = {');
    expect(guide).toContain("worldline.observer('public-users', userLens)");
  });
});
