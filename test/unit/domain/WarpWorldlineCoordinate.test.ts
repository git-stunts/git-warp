import { describe, expect, it } from 'vitest';

import WarpError from '../../../src/domain/errors/WarpError.ts';
import WarpWorldlineCoordinate from '../../../src/domain/WarpWorldlineCoordinate.ts';
import type WorldlineOptic from '../../../src/domain/services/optic/WorldlineOptic.ts';

function unusedOptic(): WorldlineOptic {
  throw new WarpError('unused optic factory', 'E_TEST_UNUSED_OPTIC_FACTORY');
}

describe('WarpWorldlineCoordinate over a cone basis (#1039)', () => {
  it('pins a cone root and its frontier, and builds its optic on demand', () => {
    const coordinate = new WarpWorldlineCoordinate({
      worldlineName: 'events', coneRoot: 'abcd', frontier: new Map([['w2', 'sha2'], ['w1', 'sha1']]), createOptic: unusedOptic,
    });
    expect(coordinate.coneRoot).toBe('abcd');
    expect(coordinate.basisIdentity()).toEqual(['cone', 'abcd']);
    expect(coordinate.frontierEntries).toEqual([{ writerId: 'w1', patchSha: 'sha1' }, { writerId: 'w2', patchSha: 'sha2' }]);
    expect(coordinate.frontier()).toEqual(new Map([['w1', 'sha1'], ['w2', 'sha2']]));
    expect(Object.isFrozen(coordinate)).toBe(true);
    expect(() => coordinate.optic()).toThrow('unused optic factory');
  });

  it('rejects malformed frontier input before copying entries', () => {
    expect(() => new WarpWorldlineCoordinate({
      worldlineName: 'events', coneRoot: 'abcd', createOptic: unusedOptic,
      // @ts-expect-error exercising runtime validation for JavaScript callers
      frontier: 'not-a-frontier',
    })).toThrow('WarpWorldline coordinate requires a frontier Map');
  });

  it('rejects blank identity fields and a missing optic factory', () => {
    expect(() => new WarpWorldlineCoordinate({ worldlineName: '   ', coneRoot: 'abcd', frontier: new Map(), createOptic: unusedOptic }))
      .toThrow('non-empty identity fields');
    expect(() => new WarpWorldlineCoordinate({ worldlineName: 'events', coneRoot: ' ', frontier: new Map(), createOptic: unusedOptic }))
      .toThrow('non-empty identity fields');
    expect(() => new WarpWorldlineCoordinate({
      worldlineName: 'events', coneRoot: 'abcd', frontier: new Map([['writer-1', '   ']]), createOptic: unusedOptic,
    })).toThrow('non-empty identity fields');
    expect(() => new WarpWorldlineCoordinate({
      worldlineName: 'events', coneRoot: 'abcd', frontier: new Map(),
      // @ts-expect-error exercising runtime validation for JavaScript callers
      createOptic: 'not-a-factory',
    })).toThrow('requires an optic factory');
  });
});
