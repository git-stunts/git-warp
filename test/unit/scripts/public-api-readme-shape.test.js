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
  it('uses worldline-first observer reads in Quick Start', () => {
    const quickStart = betweenHeadings(readme, '## Quick Start', '## Documentation Map');
    expect(quickStart).toMatch(/worldline\([\s\S]*?\.observer\(/);
    expect(quickStart).toMatch(/\.observer\([\s\S]*?\.query\(\)/);
  });

  it('introduces core primitives and read doctrine before raw querying sections', () => {
    const corePrimitives = readme.indexOf('## Core Primitives');
    const readModel = readme.indexOf('## Read Model');
    const querying = readme.indexOf('## Querying');

    expect(corePrimitives).toBeGreaterThan(-1);
    expect(readModel).toBeGreaterThan(-1);
    expect(querying).toBeGreaterThan(-1);
    expect(corePrimitives).toBeLessThan(querying);
    expect(readModel).toBeLessThan(querying);
  });

  it('labels whole-state enumeration as inspection rather than the default product read path', () => {
    expect(readme).toContain('Whole-state enumeration and direct materialization are inspection or advanced substrate operations, not normal product hot paths.');
    expect(readme).toContain('Use `getNodes()`, `getEdges()`, `getNodeProps()`, `neighbors()`, and direct `materialize*()` helpers for debugging, migration, bounded tooling, or explicit substrate inspection.');
    expect(readme).toContain('For application-facing reads, prefer `worldline()` plus `observer(...)` and then query or traverse through that read handle.');
  });
});
