import { describe, expect, it } from 'vitest';

import SubstrateCoordinateBoundary, {
  SESSION_POLICY_CAPABILITY_NAMES,
  SUBSTRATE_CAPABILITY_NAMES,
  SUBSTRATE_COORDINATE_KINDS,
  SUBSTRATE_LANE_KINDS,
} from '../../../../../src/domain/services/coordinate/SubstrateCoordinateBoundary.ts';

describe('SubstrateCoordinateBoundary', () => {
  it('freezes the stable lane and coordinate noun families', () => {
    expect(SUBSTRATE_LANE_KINDS).toEqual(['worldline', 'strand', 'braid']);
    expect(SUBSTRATE_COORDINATE_KINDS).toEqual(['live', 'frontier', 'checkpoint', 'strand-base']);
    expect(Object.isFrozen(SUBSTRATE_LANE_KINDS)).toBe(true);
    expect(Object.isFrozen(SUBSTRATE_COORDINATE_KINDS)).toBe(true);
  });

  it('separates substrate capabilities from debugger session policy', () => {
    const boundary = new SubstrateCoordinateBoundary();

    expect(boundary.authorityFor('worldline.live')).toBe('substrate');
    expect(boundary.authorityFor('strand.braid')).toBe('substrate');
    expect(boundary.authorityFor('coordinate.transfer-plan')).toBe('substrate');
    expect(boundary.authorityFor('debugger.cursor')).toBe('session-policy');
    expect(boundary.authorityFor('session.shortcut')).toBe('session-policy');
    expect(boundary.authorityFor('debugger.unregistered')).toBeNull();
    expect(Object.isFrozen(SUBSTRATE_CAPABILITY_NAMES)).toBe(true);
    expect(Object.isFrozen(SESSION_POLICY_CAPABILITY_NAMES)).toBe(true);
  });
});
