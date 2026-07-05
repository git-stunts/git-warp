import { describe, expect, it } from 'vitest';

import {
  BoundedSupportRule,
  CausalIndexPlan,
} from '../../../../../legacy.ts';
import QueryError from '../../../../../src/domain/errors/QueryError.ts';

describe('CausalIndexPlan', () => {
  it('maps entity support to the provenance entity-patch index family', () => {
    const supportRule = BoundedSupportRule.entityRead({
      surface: 'query',
      nodeIds: ['node:b', 'node:a'],
    });
    const plan = CausalIndexPlan.fromSupportRule(supportRule);

    expect(plan.supportRule).toBe(supportRule);
    expect(plan.posture).toBe('available');
    expect(plan.families).toEqual(['entity-patch']);
    expect(plan.requiredEntityIds).toEqual(['node:a', 'node:b']);
    expect(plan.canUseCausalIndex()).toBe(true);
    expect(plan.requiresGlobalScan()).toBe(false);
  });

  it('maps neighborhood support to a composite causal-index posture', () => {
    const supportRule = BoundedSupportRule.neighborhoodRead({
      surface: 'query',
      rootNodeIds: ['node:root'],
      maxDepth: 2,
      directions: ['outgoing'],
    });
    const plan = CausalIndexPlan.fromSupportRule(supportRule);

    expect(plan.posture).toBe('composite');
    expect(plan.families).toEqual(['entity-patch', 'neighborhood-adjacency']);
    expect(plan.requiredEntityIds).toEqual(['node:root']);
    expect(plan.canUseCausalIndex()).toBe(true);
  });

  it('marks global discovery as unsupported by bounded causal indexes', () => {
    const supportRule = BoundedSupportRule.globalDiscovery({
      surface: 'query',
      reason: 'wildcard query',
    });
    const plan = CausalIndexPlan.fromSupportRule(supportRule);

    expect(plan.posture).toBe('unsupported');
    expect(plan.families).toEqual(['global-discovery']);
    expect(plan.requiredEntityIds).toEqual([]);
    expect(plan.canUseCausalIndex()).toBe(false);
    expect(plan.requiresGlobalScan()).toBe(true);
  });

  it('rejects invalid runtime carriers', () => {
    expect(() => CausalIndexPlan.fromSupportRule(
      // @ts-expect-error runtime guard for JavaScript callers
      undefined,
    )).toThrow(QueryError);
  });
});
