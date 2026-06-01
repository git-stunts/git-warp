import { describe, expect, it } from 'vitest';

import WarpError from '../../../src/domain/errors/WarpError.ts';
import WarpWorldlineCoordinate from '../../../src/domain/WarpWorldlineCoordinate.ts';
import type Worldline from '../../../src/domain/services/Worldline.ts';

function unusedWorldlineFactory(): Worldline {
  throw new WarpError('unused worldline factory', 'E_TEST_UNUSED_WORLDLINE_FACTORY');
}

describe('WarpWorldlineCoordinate', () => {
  it('rejects malformed frontier input before copying entries', () => {
    expect(
      () =>
        new WarpWorldlineCoordinate({
          worldlineName: 'events',
          checkpointSha: 'checkpoint-sha',
          // @ts-expect-error exercising runtime validation for JavaScript callers
          frontier: 'not-a-frontier',
          createWorldline: unusedWorldlineFactory,
        })
    ).toThrow(WarpError);

    expect(
      () =>
        new WarpWorldlineCoordinate({
          worldlineName: 'events',
          checkpointSha: 'checkpoint-sha',
          // @ts-expect-error exercising runtime validation for JavaScript callers
          frontier: 'not-a-frontier',
          createWorldline: unusedWorldlineFactory,
        })
    ).toThrow('WarpWorldline coordinate requires a frontier Map');
  });

  it('rejects blank identity fields', () => {
    expect(
      () =>
        new WarpWorldlineCoordinate({
          worldlineName: '   ',
          checkpointSha: 'checkpoint-sha',
          frontier: new Map([['writer-1', 'patch-sha']]),
          createWorldline: unusedWorldlineFactory,
        })
    ).toThrow('WarpWorldline coordinate requires non-empty identity fields');

    expect(
      () =>
        new WarpWorldlineCoordinate({
          worldlineName: 'events',
          checkpointSha: 'checkpoint-sha',
          frontier: new Map([['writer-1', '   ']]),
          createWorldline: unusedWorldlineFactory,
        })
    ).toThrow('WarpWorldline coordinate requires non-empty identity fields');
  });

  it('rejects malformed worldline factory input', () => {
    expect(
      () =>
        new WarpWorldlineCoordinate({
          worldlineName: 'events',
          checkpointSha: 'checkpoint-sha',
          frontier: new Map([['writer-1', 'patch-sha']]),
          // @ts-expect-error exercising runtime validation for JavaScript callers
          createWorldline: 'not-a-factory',
        })
    ).toThrow('WarpWorldline coordinate requires a worldline factory');
  });
});
