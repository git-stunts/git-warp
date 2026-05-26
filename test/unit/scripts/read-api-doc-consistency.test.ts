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
    expect(gettingStarted).toMatch(/audit\.live\(\)[\s\S]*?worldline\.query\(/);
    expect(gettingStarted).toMatch(/audit\.observer\(/);
    expect(guide).toMatch(/team\.live\(\)[\s\S]*?worldline\.query\(/);
    expect(guide).toContain('const view = await worldline.observer');
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
    // v18 may name legacy facades in compatibility notes, but the primary
    // learning path must not teach those facades as normal app entrypoints.
    expect(gettingStarted).not.toContain('WarpApp.open({');
    expect(gettingStarted).not.toContain('WarpCore.open({');
    expect(guide).not.toContain('WarpApp.open({');
    expect(guide).not.toContain('WarpCore.open({');
    expect(guide).not.toContain('open with `WarpApp`');
  });
});
