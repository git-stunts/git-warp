import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readme = readFileSync(
  fileURLToPath(new URL('../../../README.md', import.meta.url)),
  'utf8',
);

/**
 * @param {string} source
 * @param {string} startHeading
 * @param {string} endHeading
 * @returns {string}
 */
function betweenHeadings(source, startHeading, endHeading) {
  const start = source.indexOf(startHeading);
  const end = source.indexOf(endHeading);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Unable to find ordered headings: ${startHeading} -> ${endHeading}`);
  }
  return source.slice(start, end);
}

describe('README public API teaching order', () => {
  it('keeps release history out of the README front matter', () => {
    expect(readme).not.toContain('## What\'s New');
  });

  it('uses worldline-first observer reads in Quick Start', () => {
    const quickStart = betweenHeadings(readme, '## Quick Start', '## Documentation Map');
    expect(quickStart).toMatch(/worldline\([\s\S]*?\.observer\(/);
    expect(quickStart).toMatch(/\.observer\([\s\S]*?\.query\(\)/);
    expect(quickStart).toMatch(/The first argument to `observer\(\.\.\.\)` is just a descriptive label for that read[\s\S]*?meaningful to your app or debugger\./);
  });

  it('introduces concepts, glossary, and main components before raw querying sections', () => {
    const concepts = readme.indexOf('## Concepts');
    const glossary = readme.indexOf('## Glossary');
    const mainComponents = readme.indexOf('## Main Components');
    const readModel = readme.indexOf('## Read Model');
    const querying = readme.indexOf('## Querying');

    expect(concepts).toBeGreaterThan(-1);
    expect(glossary).toBeGreaterThan(-1);
    expect(mainComponents).toBeGreaterThan(-1);
    expect(readModel).toBeGreaterThan(-1);
    expect(querying).toBeGreaterThan(-1);
    expect(concepts).toBeLessThan(querying);
    expect(glossary).toBeLessThan(querying);
    expect(mainComponents).toBeLessThan(querying);
    expect(readModel).toBeLessThan(querying);
    expect(readme).not.toContain('## Core Primitives');
  });

  it('labels whole-state enumeration as inspection and explains the read-model tradeoff', () => {
    expect(readme).toContain('Whole-state enumeration and direct materialization are inspection or advanced substrate operations, not normal product hot paths.');
    expect(readme).toContain('Use `getNodes()`, `getEdges()`, `getNodeProps()`, `neighbors()`, and direct `materialize*()` helpers for debugging, migration, bounded tooling, or explicit substrate inspection.');
    expect(readme).toContain('For application-facing reads, prefer `worldline()` plus `observer(...)` and then query or traverse through that read handle.');
    expect(readme).toContain('That boundary keeps the read coordinate explicit, preserves the observer aperture, and reduces the temptation to preload the whole visible graph into application memory.');
  });
});
