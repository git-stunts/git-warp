import { describe, expect, it } from 'vitest';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import ConeObstructedError from '../../../src/domain/errors/ConeObstructedError.ts';
import NodeAdd from '../../../src/domain/types/ops/NodeAdd.ts';
import WarpWorldlineCoordinate from '../../../src/domain/WarpWorldlineCoordinate.ts';
import {
  captureConeCoordinate,
  captureRetainedConeCoordinate,
  coordinateConeBasis,
  liveConeOptic,
} from '../../../src/domain/WarpWorldlineConeOptics.ts';
import { coneLane } from '../../helpers/coneLane.ts';

describe('WarpWorldlineConeOptics (#1039)', () => {
  it('binds the captured basis to each coordinate it captures, retained or not', async () => {
    const { cone, store } = coneLane('events', [['alice', [new NodeAdd('doc', new Dot('alice', 1))]]]);
    const transient = await captureConeCoordinate('events', cone);
    expect(store.retained('events')).toEqual([]);
    const kept = await captureRetainedConeCoordinate('events', cone);
    expect(store.retained('events')).toHaveLength(1);
    expect(coordinateConeBasis(kept).equals(coordinateConeBasis(transient))).toBe(true);
    expect(kept.coneRoot).toBe(coordinateConeBasis(kept).root.toString());
    await expect(kept.optic().node('doc').read()).resolves.toMatchObject({ alive: true });
    await expect(liveConeOptic('events', cone).node('doc').read()).resolves.toMatchObject({ alive: true });
  });

  it('refuses a coordinate this runtime did not capture and throws a typed obstruction', async () => {
    const foreign = new WarpWorldlineCoordinate({
      worldlineName: 'events', coneRoot: 'abcd', frontier: new Map(), createOptic: () => { throw new Error('unused'); },
    });
    expect(() => coordinateConeBasis(foreign)).toThrow(expect.objectContaining({ code: 'E_WARP_WORLDLINE_COORDINATE' }));
    const { cone, feed } = coneLane('events', [['alice', [new NodeAdd('doc', new Dot('alice', 1))]]]);
    feed.diverged.add('alice');
    await expect(captureRetainedConeCoordinate('events', cone)).rejects.toBeInstanceOf(ConeObstructedError);
  });
});
