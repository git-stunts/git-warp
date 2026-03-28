import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const guide = readFileSync(
  fileURLToPath(new URL('../../../docs/GUIDE.md', import.meta.url)),
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

describe('Guide public read-model teaching shape', () => {
  it('uses worldline-first reads in Quick Start', () => {
    const quickStart = betweenHeadings(guide, '## Quick Start', '## Writing Data');
    expect(quickStart).toMatch(/WarpApp\.open\(/);
    expect(quickStart).toMatch(/app\.worldline\(\)/);
    expect(quickStart).toMatch(/worldline\.getNodeProps\('todo:1'\)/);
    expect(quickStart).toMatch(/worldline\.query\(\)/);
    expect(quickStart).toMatch(/worldline\.traverse\.shortestPath/);
    expect(quickStart).not.toContain('await app.materialize();');
  });

  it('teaches product reads before inspection in the reading section', () => {
    const reading = betweenHeadings(guide, '## Reading Data', '## Querying');
    expect(reading).toContain('### Product Reads');
    expect(reading).toContain('### Inspection And Materialization');
    expect(reading.indexOf('### Product Reads')).toBeLessThan(
      reading.indexOf('### Inspection And Materialization'),
    );
    expect(reading).toContain('For application-facing reads, start from `worldline()`.');
    expect(reading).toMatch(
      /Use runtime-wide enumeration and direct materialization when you are doing[\s\S]*bounded inspection, debugging, migration, or lower-level substrate work\./,
    );
  });

  it('leads the query section with worldline-scoped query examples', () => {
    const querying = betweenHeadings(guide, '## Querying', '## Multi-Writer Collaboration');
    expect(querying).toMatch(/const worldline = (graph|app)\.worldline\(\);[\s\S]*?worldline\.query\(\)/);
    expect(querying).toMatch(
      /The same `QueryBuilder` surface is available on `Worldline`, `Observer`, and[\s\S]*`WarpCore`\./,
    );
  });
});
