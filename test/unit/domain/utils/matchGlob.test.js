import { describe, it, expect } from 'vitest';

import { matchGlob } from '../../../../src/domain/utils/matchGlob.js';

describe('matchGlob', () => {
  it('matches wildcard and literal patterns', () => {
    expect(matchGlob('*', 'anything')).toBe(true);
    expect(matchGlob('warp', 'warp')).toBe(true);
    expect(matchGlob('warp', 'graft')).toBe(false);
    expect(matchGlob('warp*', 'warp-core')).toBe(true);
  });

  it('supports arrays of patterns with OR semantics', () => {
    expect(matchGlob(['foo*', 'bar*'], 'barista')).toBe(true);
    expect(matchGlob(['foo*', 'bar*'], 'qux')).toBe(false);
  });

  it('returns false for non-string scalar patterns', () => {
    expect(matchGlob(/** @type {unknown} */ (42), 'answer')).toBe(false);
  });

  it('escapes regex metacharacters in literal portions of globs', () => {
    expect(matchGlob('file?.js', 'file1.js')).toBe(false);
    expect(matchGlob('file?.js', 'file?.js')).toBe(true);
  });

  it('clears and reseeds the regex cache when it reaches the size cap', () => {
    for (let i = 0; i < 1000; i += 1) {
      expect(matchGlob(`cache-${i}-*`, `cache-${i}-value`)).toBe(true);
    }

    expect(matchGlob('after-reset-*', 'after-reset-value')).toBe(true);
  });
});
