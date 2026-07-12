import { describe, expect, it } from 'vitest';

import {
  BoundedSupportRule,
  CausalIndexPlan,
  SupportFragmentPlan,
} from '../../../../../advanced.ts';
import { QueryBuilder } from '../../../../../diagnostics.ts';
import QueryError from '../../../../../src/domain/errors/QueryError.ts';
import type {
  QueryNeighborEntry,
  QueryReadModel,
  QueryReadModelOpenRequest,
  QueryReadModelProvider,
} from '../../../../../src/domain/services/query/QueryReadModelProvider.ts';
import type { QueryNodeSnapshot } from '../../../../../src/domain/services/query/QueryPlan.ts';

class NoopQueryReadModelProvider implements QueryReadModelProvider {
  async openQueryReadModel(_request?: QueryReadModelOpenRequest): Promise<QueryReadModel> {
    return {
      stateHash: 'unused',
      async *nodes() {
        const nodes: QueryNodeSnapshot[] = [];
        for (const node of nodes) {
          yield node;
        }
      },
      async *neighbors() {
        const neighbors: QueryNeighborEntry[] = [];
        for (const neighbor of neighbors) {
          yield neighbor;
        }
      },
      async nodeProps() {
        return null;
      },
    };
  }
}

function query(): QueryBuilder {
  return new QueryBuilder(new NoopQueryReadModelProvider());
}

describe('SupportFragmentPlan', () => {
  it('creates a cacheable support fragment plan for exact entity reads', () => {
    const plan = query().match('node:a').supportFragmentPlan();

    expect(plan).toBeInstanceOf(SupportFragmentPlan);
    expect(plan.posture).toBe('support-fragment');
    expect(plan.supportRule.kind).toBe('entity');
    expect(plan.causalIndexPlan.families).toEqual(['entity-patch']);
    expect(plan.requiredEntityIds).toEqual(['node:a']);
    expect(plan.canMaterializeSupportFragment()).toBe(true);
    expect(plan.requiresFullGraphFallback()).toBe(false);
    expect(plan.fragmentKeyForCoordinate('frontier:demo')).toBe(
      'surface:query/kind:entity/roots:node:a/depth:none/directions:none/indexes:entity-patch@frontier:demo'
    );
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.requiredEntityIds)).toBe(true);
  });

  it('creates an index-fill support fragment plan for rooted traversals', () => {
    const plan = query()
      .match('node:a')
      .outgoing('links', { depth: [1, 2] })
      .supportFragmentPlan();

    expect(plan.posture).toBe('support-fragment-with-index-fill');
    expect(plan.supportRule.kind).toBe('neighborhood');
    expect(plan.scopeKey).toContain('depth:2');
    expect(plan.scopeKey).toContain('directions:outgoing');
    expect(plan.scopeKey).toContain('indexes:entity-patch+neighborhood-adjacency');
  });

  it('marks wildcard discovery as full-graph fallback instead of a fragment key', () => {
    const plan = query().match('node:*').supportFragmentPlan();

    expect(plan.posture).toBe('global-fallback');
    expect(plan.canMaterializeSupportFragment()).toBe(false);
    expect(plan.requiresFullGraphFallback()).toBe(true);
    expect(() => plan.fragmentKeyForCoordinate('frontier:demo')).toThrow(QueryError);
  });

  it('rejects mismatched support and causal index plans', () => {
    const supportRule = BoundedSupportRule.entityRead({
      surface: 'query',
      nodeIds: ['node:a'],
    });
    const otherSupportRule = BoundedSupportRule.entityRead({
      surface: 'query',
      nodeIds: ['node:b'],
    });

    expect(() =>
      SupportFragmentPlan.fromSupportAndIndex({
        supportRule,
        causalIndexPlan: CausalIndexPlan.fromSupportRule(otherSupportRule),
      })
    ).toThrow(QueryError);

    expect(() =>
      SupportFragmentPlan.fromSupportRule(
        // @ts-expect-error runtime guard for JavaScript callers
        undefined
      )
    ).toThrow(QueryError);
  });
});
