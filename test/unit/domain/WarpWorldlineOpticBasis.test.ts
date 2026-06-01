import { describe, expect, it } from 'vitest';

import WarpWorldlineOpticBasis from '../../../src/domain/WarpWorldlineOpticBasis.ts';

describe('WarpWorldlineOpticBasis', () => {
  it('rejects blank identity fields', () => {
    expect(
      () =>
        new WarpWorldlineOpticBasis({
          worldlineName: '   ',
          checkpointSha: 'checkpoint-sha',
        })
    ).toThrow('WarpWorldline optic basis requires non-empty identity fields');

    expect(
      () =>
        new WarpWorldlineOpticBasis({
          worldlineName: 'events',
          checkpointSha: '   ',
        })
    ).toThrow('WarpWorldline optic basis requires non-empty identity fields');
  });
});
