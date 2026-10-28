import { describe, expect, it } from 'vitest';

import WarpError from '../../../src/domain/errors/WarpError.ts';
import WarpWorldlineCoordinate from '../../../src/domain/WarpWorldlineCoordinate.ts';
import type ProjectionHandle from '../../../src/domain/services/ProjectionHandle.ts';

function unusedWorldlineFactory(): ProjectionHandle {
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

describe('WarpWorldlineCoordinate over a cone basis (#1039)', () => {
  const optic = () => {
    throw new WarpError('unused optic factory', 'E_TEST_UNUSED_OPTIC_FACTORY');
  };

  it('pins a cone root instead of a checkpoint', () => {
    const coordinate = new WarpWorldlineCoordinate({
      worldlineName: 'events', coneRoot: 'abcd', frontier: new Map([['w', 'sha']]), createOptic: optic,
    });
    expect(coordinate.checkpointSha).toBeNull();
    expect(coordinate.coneRoot).toBe('abcd');
    expect(coordinate.basisIdentity()).toEqual(['cone', 'abcd']);
    expect(() => coordinate.requireCheckpointSha()).toThrow('pinned to a cone basis');
    expect(() => coordinate.source()).toThrow('pinned to a cone basis');
    expect(() => coordinate.optic()).toThrow('unused optic factory');
  });

  it('identifies a checkpoint coordinate by its checkpoint', () => {
    const coordinate = new WarpWorldlineCoordinate({
      worldlineName: 'events', checkpointSha: 'checkpoint-sha', frontier: new Map(), createWorldline: unusedWorldlineFactory,
    });
    expect(coordinate.coneRoot).toBeNull();
    expect(coordinate.basisIdentity()).toEqual(['checkpoint-sha']);
    expect(coordinate.requireCheckpointSha()).toBe('checkpoint-sha');
  });

  it('rejects a blank cone root or a missing optic factory', () => {
    expect(() => new WarpWorldlineCoordinate({ worldlineName: 'events', coneRoot: ' ', frontier: new Map(), createOptic: optic }))
      .toThrow('non-empty identity fields');
    expect(() => new WarpWorldlineCoordinate({
      worldlineName: 'events', coneRoot: 'abcd', frontier: new Map(),
      // @ts-expect-error exercising runtime validation for JavaScript callers
      createOptic: 'not-a-factory',
    })).toThrow('requires an optic factory');
  });
});
