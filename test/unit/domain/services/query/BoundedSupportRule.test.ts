import { describe, expect, it } from 'vitest';

import { BoundedSupportRule } from '../../../../../advanced.ts';
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

describe('BoundedSupportRule', () => {
  it('classifies exact node-id queries as entity support', () => {
    const rule = query().match('user:alice').supportRule();

    expect(rule).toBeInstanceOf(BoundedSupportRule);
    expect(Object.isFrozen(rule)).toBe(true);
    expect(rule.kind).toBe('entity');
    expect(rule.rootNodeIds).toEqual(['user:alice']);
    expect(rule.isBounded()).toBe(true);
    expect(rule.requiresWholeGraphDiscovery()).toBe(false);
  });

  it('classifies exact rooted traversal as neighborhood support', () => {
    const rule = query()
      .match('user:ceo')
      .outgoing('manages', { depth: [1, 3] })
      .incoming('reports-to', { depth: 1 })
      .supportRule();

    expect(rule.kind).toBe('neighborhood');
    expect(rule.rootNodeIds).toEqual(['user:ceo']);
    expect(rule.maxDepth).toBe(3);
    expect(rule.directions).toEqual(['incoming', 'outgoing']);
    expect(rule.isBounded()).toBe(true);
  });

  it('classifies wildcard reads as global discovery', () => {
    const rule = query().match('task:*').where({ status: 'todo' }).supportRule();

    expect(rule.kind).toBe('global-discovery');
    expect(rule.rootNodeIds).toEqual([]);
    expect(rule.requiresWholeGraphDiscovery()).toBe(true);
    expect(rule.reason).toContain('visible graph');
  });

  it('normalizes explicit support-rule fields', () => {
    const rule = new BoundedSupportRule({
      surface: 'query',
      kind: 'entity',
      reason: 'manual exact read',
      rootNodeIds: ['node:b', 'node:a', 'node:a'],
    });

    expect(rule.rootNodeIds).toEqual(['node:a', 'node:b']);
    expect(Object.isFrozen(rule.rootNodeIds)).toBe(true);
  });

  it('rejects invalid runtime carriers', () => {
    expect(
      () =>
        new BoundedSupportRule({
          surface: 'query',
          kind: 'entity',
          reason: 'bad max depth',
          maxDepth: -1,
        })
    ).toThrow(QueryError);

    expect(() =>
      BoundedSupportRule.fromQueryPlan(
        // @ts-expect-error runtime guard for JavaScript callers
        undefined
      )
    ).toThrow(QueryError);
  });
});
