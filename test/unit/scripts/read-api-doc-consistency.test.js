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

const readme = readDoc('README.md');
const guide = readDoc('docs/GUIDE.md');
const strands = readDoc('docs/STRANDS.md');

describe('public read API docs stay aligned with observer geometry', () => {
  it('teaches worldline-first pinned read examples in the public docs', () => {
    expect(readme).toMatch(/worldline\([\s\S]*?worldline\.query\(/);
    expect(guide).toMatch(/worldline\([\s\S]*?worldline\.query\(/);
    expect(guide).toMatch(/worldline\([\s\S]*?\.observer\(/);
    expect(strands).toMatch(/worldline\([\s\S]*?\.observer\(/);
  });

  it('describes coordinate and strand materialization as detached immutable snapshots', () => {
    expect(readme).toContain('detached immutable snapshot');
    expect(guide).toContain('detached immutable snapshot');
    expect(strands).toContain('detached immutable snapshot');
  });

  it('states that pinned materialization does not retarget the caller runtime', () => {
    expect(readme).toContain('does not retarget the caller runtime');
    expect(guide).toContain('does not retarget the caller runtime');
    expect(strands).toContain('does not retarget the caller runtime');
  });

  it('keeps the legacy WarpGraph noun out of the public read-surface docs', () => {
    expect(readme).not.toContain('WarpGraph');
    expect(guide).not.toContain('WarpGraph');
    expect(strands).not.toContain('WarpGraph');
  });
});
