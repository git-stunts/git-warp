import { describe, expect, it } from 'vitest';

import { shouldAutoUpdateCoverageRatchet } from '../../../scripts/coverage-ratchet.ts';

describe('coverage ratchet policy', () => {
  it('enables threshold writes only for explicit full-suite coverage runs', () => {
    expect(shouldAutoUpdateCoverageRatchet({})).toBe(false);
    expect(shouldAutoUpdateCoverageRatchet({
      GIT_WARP_UPDATE_COVERAGE_RATCHET: '0',
    })).toBe(false);
    expect(shouldAutoUpdateCoverageRatchet({
      GIT_WARP_UPDATE_COVERAGE_RATCHET: '1',
    })).toBe(true);
  });
});
