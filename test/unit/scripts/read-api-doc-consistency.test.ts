import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// repoRoot removed — unused after readDoc refactor

/**
 * @param {string} relativePath
 * @returns {string}
 */
function readDoc(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)), 'utf8');
}

const readme = readDoc('README.md');
const gettingStarted = readDoc('docs/GETTING_STARTED.md');
const guide = readDoc('docs/GUIDE.md');
const advancedGuide = readDoc('docs/ADVANCED_GUIDE.md');

describe('public read API docs stay aligned with observer geometry', () => {
  it('teaches worldline-first pinned read examples in the learning and builder docs', () => {
    expect(gettingStarted).toMatch(/worldline\([\s\S]*?worldline\.query\(/);
    expect(gettingStarted).toMatch(/worldline\([\s\S]*?\.observer\(/);
    expect(guide).toMatch(/worldline\([\s\S]*?worldline\.query\(/);
    expect(guide).toMatch(/worldline\([\s\S]*?\.observer\(/);
    expect(advancedGuide).toContain('## Strands and braids');
  });

  it('keeps pinned materialization details in the deeper docs, not the front door docs', () => {
    expect(readme).not.toContain('detached immutable snapshot');
    expect(gettingStarted).not.toContain('detached immutable snapshot');
    expect(guide).not.toContain('detached immutable snapshot');
    expect(advancedGuide).not.toContain('detached immutable snapshot');
  });

  it('keeps runtime-retargeting caveats in the deeper docs, not the front door docs', () => {
    expect(readme).not.toContain('does not retarget the caller runtime');
    expect(gettingStarted).not.toContain('does not retarget the caller runtime');
    expect(guide).not.toContain('does not retarget the caller runtime');
    expect(advancedGuide).not.toContain('does not retarget the caller runtime');
  });

  it('keeps code-heavy read examples out of the evaluator README', () => {
    expect(readme).not.toContain('WarpApp.open(');
    expect(readme).not.toContain('worldline.query()');
  });

  it('keeps the legacy WarpCore/WarpApp nouns out of the public read-surface docs', () => {
    // v17: WarpGraph is the official interface returned by openWarpGraph().
    // WarpCore and WarpApp are legacy nouns that should not appear in
    // the primary learning path.
    expect(gettingStarted).not.toContain('WarpCore');
    expect(gettingStarted).not.toContain('WarpApp');
    expect(guide).not.toContain('WarpCore');
  });
});
