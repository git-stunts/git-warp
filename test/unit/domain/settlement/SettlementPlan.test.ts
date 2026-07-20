import { describe, expect, it } from 'vitest';

import WarpError from '../../../../src/domain/errors/WarpError.ts';
import SettlementPlan from '../../../../src/domain/settlement/SettlementPlan.ts';

function plan(): SettlementPlan {
  return new SettlementPlan({
    planDigest: 'sha256:plan',
    sourceLaneId: 'lane:draft',
    targetLaneId: 'lane:main',
    sourceFrontierRef: 'frontier:draft:7',
    targetFrontierRef: 'frontier:main:11',
    proposalDigest: 'sha256:proposal',
    lawDigest: 'sha256:law',
    policyDigest: 'sha256:policy',
  });
}

describe('SettlementPlan', () => {
  it('is immutable, non-authoritative, and bound to exact causal inputs', () => {
    const value = plan();

    expect(value.invalidationRule).toBe('any-bound-input-change');
    expect(value.planDigest).toBe('sha256:plan');
    expect(value.sourceLaneId).toBe('lane:draft');
    expect(value.targetLaneId).toBe('lane:main');
    expect(value.sourceFrontierRef).toBe('frontier:draft:7');
    expect(value.targetFrontierRef).toBe('frontier:main:11');
    expect(value.proposalDigest).toBe('sha256:proposal');
    expect(value.lawDigest).toBe('sha256:law');
    expect(value.policyDigest).toBe('sha256:policy');
    expect(Object.isFrozen(value)).toBe(true);
  });

  it('rejects malformed plans and same-lane settlement', () => {
    expect(
      () =>
        new SettlementPlan(
          // @ts-expect-error runtime guard for JavaScript callers
          undefined
        )
    ).toThrow(WarpError);
    expect(
      () =>
        new SettlementPlan(
          // @ts-expect-error runtime guard for JavaScript callers
          null
        )
    ).toThrow(WarpError);
    expect(
      () =>
        new SettlementPlan({
          planDigest: '',
          sourceLaneId: 'lane:draft',
          targetLaneId: 'lane:main',
          sourceFrontierRef: 'frontier:draft:7',
          targetFrontierRef: 'frontier:main:11',
          proposalDigest: 'sha256:proposal',
          lawDigest: 'sha256:law',
          policyDigest: 'sha256:policy',
        })
    ).toThrow(WarpError);
    expect(
      () =>
        new SettlementPlan({
          planDigest: 'sha256:plan',
          sourceLaneId: 'lane:main',
          targetLaneId: 'lane:main',
          sourceFrontierRef: 'frontier:main:7',
          targetFrontierRef: 'frontier:main:11',
          proposalDigest: 'sha256:proposal',
          lawDigest: 'sha256:law',
          policyDigest: 'sha256:policy',
        })
    ).toThrow(WarpError);
  });
});
