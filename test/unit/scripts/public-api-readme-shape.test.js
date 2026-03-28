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

  it('uses worldline-first reads and shows write/read/query/traverse in Quick Start', () => {
    const quickStart = betweenHeadings(readme, '## Quick Start', '## What Is git-warp?');
    expect(quickStart).toMatch(/npm install @git-stunts\/git-warp @git-stunts\/plumbing/);
    expect(quickStart).toMatch(/WarpApp\.open\(/);
    expect(quickStart).toMatch(/app\.patch\(/);
    expect(quickStart).toMatch(/worldline\(\)/);
    expect(quickStart).toMatch(/worldline\.getNodeProps\('user:alice'\)/);
    expect(quickStart).toMatch(/worldline\.query\(\)/);
    expect(quickStart).toMatch(/worldline\.traverse\.shortestPath/);
    expect(quickStart).toContain('const publicUserLens = {');
    expect(quickStart).toContain("worldline.observer('public-users', publicUserLens)");
  });

  it('uses WarpApp for app examples and app.core() for explicit substrate escape hatches', () => {
    expect(readme).toContain('const appA = await WarpApp.open({');
    expect(readme).toContain('const appB = await WarpApp.open({');
    expect(readme).toContain('const server = await appB.core().serve({ port: 3000 });');
    expect(readme).toContain('const core = app.core();');
  });

  it('introduces the system in progressive layers before raw querying sections', () => {
    const tldr = readme.indexOf('## TL;DR for humans');
    const quickStart = readme.indexOf('## Quick Start');
    const whatIs = readme.indexOf('## What Is git-warp?');
    const whatIsWarp = readme.indexOf('## What Is WARP?');
    const whyGit = readme.indexOf('## Why Git?');
    const whereItFits = readme.indexOf('## Where git-warp Fits');
    const glossary = readme.indexOf('## Conceptual glossary');
    const readModel = readme.indexOf('## Read Model');
    const querying = readme.indexOf('## Querying');

    expect(tldr).toBeGreaterThan(-1);
    expect(quickStart).toBeGreaterThan(-1);
    expect(whatIs).toBeGreaterThan(-1);
    expect(whatIsWarp).toBeGreaterThan(-1);
    expect(whyGit).toBeGreaterThan(-1);
    expect(whereItFits).toBeGreaterThan(-1);
    expect(glossary).toBeGreaterThan(-1);
    expect(readModel).toBeGreaterThan(-1);
    expect(querying).toBeGreaterThan(-1);
    expect(tldr).toBeLessThan(querying);
    expect(quickStart).toBeLessThan(querying);
    expect(whatIs).toBeLessThan(querying);
    expect(whatIsWarp).toBeLessThan(querying);
    expect(whyGit).toBeLessThan(querying);
    expect(whereItFits).toBeLessThan(querying);
    expect(glossary).toBeLessThan(querying);
    expect(readModel).toBeLessThan(querying);
    expect(tldr).toBeLessThan(quickStart);
    expect(quickStart).toBeLessThan(whatIs);
    expect(whatIs).toBeLessThan(whatIsWarp);
    expect(whatIsWarp).toBeLessThan(whyGit);
    expect(whyGit).toBeLessThan(whereItFits);
    expect(whereItFits).toBeLessThan(glossary);
    expect(glossary).toBeLessThan(readModel);
    expect(readme).not.toContain('## Main Components');
  });

  it('includes a conceptual glossary that bridges API nouns and theory nouns', () => {
    const glossary = betweenHeadings(readme, '## Conceptual glossary', '## Read Model');
    expect(glossary).toContain('**Tick**');
    expect(glossary).toContain('**Frontier**');
    expect(glossary).toContain('**Lamport clock**');
    expect(glossary).toContain('**Braid**');
    expect(glossary).toContain('**Worldline**');
    expect(glossary).toContain('**Strand**');
  });

  it('distinguishes WARP from Git and explains CRDT sync explicitly', () => {
    expect(readme).toContain('WARP itself is not tied to Git.');
    expect(readme).toContain('`git-warp` implements WARP on top of Git.');
    expect(readme).toContain('changes merge deterministically using CRDTs');
    expect(readme).toMatch(/You do not\s+manually resolve Git merge conflicts for graph data\./);
  });

  it('links theory and sibling runtime context and includes a fit table', () => {
    expect(readme).toContain('[AIΩN](https://github.com/flyingrobots/aion)');
    expect(readme).toContain('[Echo](https://github.com/flyingrobots/echo)');
    expect(readme).toContain('| Use Case | git-warp | Echo | Other | Remarks |');
    expect(readme).toContain('| Offline-first collaborative app |');
    expect(readme).toContain('| High-performance real-time simulation or game loop |');
    expect(readme).toContain('| Centralized OLTP web app |');
  });

  it('labels whole-state enumeration as inspection and explains the read-model tradeoff', () => {
    expect(readme).toContain('Whole-state enumeration and direct materialization are inspection or advanced substrate operations, not normal product hot paths.');
    expect(readme).toContain('Use `app.core()` when you need the plumbing-facing surface');
    expect(readme).toContain('For application-facing reads, prefer `WarpApp` plus `worldline()` for stable reads, and add `observer(...)` when you need a filtered aperture.');
    expect(readme).toContain('That boundary keeps the read coordinate explicit, preserves the observer aperture when needed, and reduces the temptation to preload the whole visible graph into application memory.');
  });

  it('does not teach direct materialization as the default way to read the graph', () => {
    expect(readme).not.toContain('When you want to read the graph, you **materialize**');
    expect(readme).toContain('When you want to read the graph in an app, start from a pinned **worldline** or **observer**.');
    expect(readme).toContain('// After git push/pull, read through a pinned worldline');
    expect(readme).toContain("const worldline = appA.worldline();");
  });

  it('does not teach the removed WarpRuntime public noun', () => {
    expect(readme).not.toContain('WarpRuntime');
  });
});
