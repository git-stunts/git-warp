import { describe, expect, it } from 'vitest';

import QueryBuilder from '../../src/domain/services/query/QueryBuilder.ts';
import QueryPlan from '../../src/domain/services/query/QueryPlan.ts';
import QueryRunner from '../../src/domain/services/query/QueryRunner.ts';

import type { QueryNodeSnapshot } from '../../src/domain/services/query/QueryPlan.ts';
import type { SnapshotPropValue } from '../../src/domain/services/snapshot/SnapshotPropValue.ts';
import type {
  QueryNeighborEntry,
  QueryNeighborOptions,
  QueryNodeStreamRequest,
  QueryPropertyBag,
  QueryReadModel,
  QueryReadModelOpenRequest,
  QueryReadModelProvider,
} from '../../src/domain/services/query/QueryReadModelProvider.ts';

type QueryNodeFixture = {
  readonly id: string;
  readonly props: QueryPropertyBag;
};

type QueryEdgeFixture = {
  readonly from: string;
  readonly to: string;
  readonly label: string;
};

class LazyQueryReadModelProvider implements QueryReadModelProvider {
  readonly openRequests: QueryReadModelOpenRequest[] = [];
  readonly nodeRequests: QueryNodeStreamRequest[] = [];
  readonly neighborRequests: Array<{ readonly nodeId: string; readonly options: QueryNeighborOptions }> = [];
  nodesPulled = 0;
  nodePropsCalls = 0;

  readonly nodes = Object.freeze<QueryNodeFixture[]>([
    {
      id: 'node:root',
      props: Object.freeze({ score: 1 }),
    },
    {
      id: 'node:target',
      props: Object.freeze({ score: 7, role: 'target' }),
    },
    {
      id: 'node:child',
      props: Object.freeze({ score: 3, role: 'child' }),
    },
  ]);

  readonly edges = Object.freeze<QueryEdgeFixture[]>([
    Object.freeze({ from: 'node:root', to: 'node:child', label: 'next' }),
    Object.freeze({ from: 'node:root', to: 'node:target', label: 'skip' }),
  ]);

  async openQueryReadModel(request?: QueryReadModelOpenRequest): Promise<QueryReadModel> {
    if (request !== undefined) {
      this.openRequests.push(request);
    }
    return new LazyQueryReadModel(this);
  }
}

class LazyQueryReadModel implements QueryReadModel {
  readonly stateHash = 'lazy-state-hash';
  private readonly provider: LazyQueryReadModelProvider;

  constructor(provider: LazyQueryReadModelProvider) {
    this.provider = provider;
  }

  async *nodes(request: QueryNodeStreamRequest): AsyncIterable<QueryNodeSnapshot> {
    this.provider.nodeRequests.push(request);
    for (const node of this.matchingNodes(request.pattern)) {
      this.provider.nodesPulled += 1;
      yield Object.freeze({
        id: node.id,
        props: node.props,
        edgesOut: Object.freeze([]),
        edgesIn: Object.freeze([]),
      });
      if (request.pattern === 'node:target') {
        throw new QueryReadModelSeamError('exact id query drained beyond the first matching node');
      }
    }
  }

  async *neighbors(
    nodeId: string,
    options: QueryNeighborOptions,
  ): AsyncIterable<QueryNeighborEntry> {
    this.provider.neighborRequests.push({ nodeId, options });
    for (const edge of this.provider.edges) {
      if (options.direction === 'outgoing' && edge.from === nodeId && edge.label === options.label) {
        yield Object.freeze({ nodeId: edge.to, label: edge.label });
      }
      if (options.direction === 'incoming' && edge.to === nodeId && edge.label === options.label) {
        yield Object.freeze({ nodeId: edge.from, label: edge.label });
      }
    }
  }

  async nodeProps(nodeId: string): Promise<QueryPropertyBag | null> {
    this.provider.nodePropsCalls += 1;
    return this.provider.nodes.find((node) => node.id === nodeId)?.props ?? null;
  }

  private matchingNodes(pattern: string | readonly string[]): readonly QueryNodeFixture[] {
    if (typeof pattern !== 'string') {
      return this.provider.nodes.filter((node) => pattern.some((entry) => matches(entry, node.id)));
    }
    return this.provider.nodes.filter((node) => matches(pattern, node.id));
  }
}

class QueryReadModelSeamError extends Error {}

function matches(pattern: string, id: string): boolean {
  if (pattern === '*') {
    return true;
  }
  if (pattern.endsWith('*')) {
    return id.startsWith(pattern.slice(0, -1));
  }
  return id === pattern;
}

function requireQueryNodes(
  result: Awaited<ReturnType<QueryBuilder['run']>>,
): ReadonlyArray<{ readonly id?: string; readonly props?: Readonly<{ [key: string]: SnapshotPropValue }> }> {
  if ('nodes' in result) {
    return result.nodes;
  }
  throw new QueryReadModelSeamError('expected query result nodes');
}

describe('query read model seam', () => {
  it('runs exact id queries through a bounded lazy read model', async () => {
    const provider = new LazyQueryReadModelProvider();
    const runner = new QueryRunner(provider);
    const plan = new QueryPlan({
      pattern: 'node:target',
      operations: [],
      select: ['id'],
      aggregate: null,
    });

    const result = await runner.run(plan);

    expect(requireQueryNodes(result)).toEqual([{ id: 'node:target' }]);
    expect(provider.nodesPulled).toBe(1);
    expect(provider.nodePropsCalls).toBe(0);
    expect(provider.neighborRequests).toEqual([]);
    expect(provider.openRequests).toEqual([
      expect.objectContaining({
        nodeRequest: { pattern: 'node:target', select: ['id'] },
        operations: [],
        aggregate: false,
      }),
    ]);
    const openRequest = provider.openRequests[0];
    expect(openRequest?.supportRule.kind).toBe('entity');
    expect(openRequest?.causalIndexPlan.families).toEqual(['entity-patch']);
    expect(openRequest?.supportFragmentPlan.posture).toBe('support-fragment');
    expect(openRequest?.supportFragmentPlan.scopeKey).toContain('roots:node:target');
  });

  it('lets QueryBuilder compose traversal and projection on the narrow provider', async () => {
    const provider = new LazyQueryReadModelProvider();
    const result = await new QueryBuilder(provider)
      .match('node:root')
      .outgoing('next')
      .select(['id', 'props'])
      .run();

    expect(requireQueryNodes(result)).toEqual([
      {
        id: 'node:child',
        props: { role: 'child', score: 3 },
      },
    ]);
    expect(provider.neighborRequests).toEqual([
      {
        nodeId: 'node:root',
        options: { direction: 'outgoing', label: 'next' },
      },
    ]);
    expect(provider.nodePropsCalls).toBe(1);
  });

  it('opens aggregate plans as aggregate read requests and reads props lazily', async () => {
    const provider = new LazyQueryReadModelProvider();
    const result = await new QueryBuilder(provider)
      .match('node:*')
      .aggregate({ count: true, sum: 'score', avg: 'score' })
      .run();

    expect(result).toEqual({
      stateHash: 'lazy-state-hash',
      count: 3,
      sum: 11,
      avg: 11 / 3,
    });
    expect(provider.openRequests).toHaveLength(1);
    expect(provider.openRequests[0]?.aggregate).toBe(true);
    expect(provider.nodePropsCalls).toBe(3);
  });
});
