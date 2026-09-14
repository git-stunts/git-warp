import { describe, expect, it } from 'vitest';

import MemoryBudgetError from '../../../../../src/domain/errors/MemoryBudgetError.ts';
import MemoryBudget from '../../../../../src/domain/memory/MemoryBudget.ts';
import WarpMemoryPool from '../../../../../src/domain/memory/WarpMemoryPool.ts';
import BoundedQueryReadModel from '../../../../../src/domain/services/query/BoundedQueryReadModel.ts';
import type {
  QueryNeighborEntry,
  QueryReadModel,
} from '../../../../../src/domain/services/query/QueryReadModelProvider.ts';
import type { QueryNodeSnapshot } from '../../../../../src/domain/services/query/QueryPlan.ts';

function nodeSnapshot(id: string): QueryNodeSnapshot {
  return { id, props: {}, edgesOut: [], edgesIn: [] };
}

describe('BoundedQueryReadModel', () => {
  it('rejects malformed sources before property access', () => {
    const pool = new WarpMemoryPool({
      name: 'bounded-query-read-model',
      budget: MemoryBudget.entries(1),
    });

    expect(() => new BoundedQueryReadModel({
      // @ts-expect-error deliberate malformed source fixture
      source: null,
      pool,
    })).toThrow(MemoryBudgetError);
  });
});

/**
 * A budget of one entry is the probe for lease discipline.
 *
 * Every streamed result acquires a lease and must release it before the next
 * is acquired. If any release is skipped, the following acquire exceeds the
 * budget and throws — so "streaming more than one item succeeds" is a direct
 * assertion that nothing leaked.
 */
function poolOfOne(): WarpMemoryPool {
  return new WarpMemoryPool({
    name: 'bounded-query-read-model',
    budget: MemoryBudget.entries(1),
  });
}

function sourceOf(overrides: Partial<QueryReadModelStub> = {}): QueryReadModelStub {
  return {
    stateHash: 'state-hash',
    // eslint-disable-next-line require-yield
    async *nodes() { return; },
    // eslint-disable-next-line require-yield
    async *neighbors() { return; },
    async nodeProps() { return null; },
    ...overrides,
  };
}

type QueryReadModelStub = QueryReadModel;

function boundedOver(source: QueryReadModelStub, pool: WarpMemoryPool): BoundedQueryReadModel {
  return new BoundedQueryReadModel({ source, pool });
}

describe('BoundedQueryReadModel lease discipline', () => {
  it('releases each node lease before acquiring the next, under a budget of one', async () => {
    const model = boundedOver(
      sourceOf({
        async *nodes() {
          yield nodeSnapshot('node:one');
          yield nodeSnapshot('node:two');
          yield nodeSnapshot('node:three');
        },
      }),
      poolOfOne(),
    );

    const seen: QueryNodeSnapshot[] = [];
    for await (const node of model.nodes({} as never)) {
      seen.push(node);
    }

    expect(seen).toHaveLength(3);
  });

  it('releases each neighbor lease before acquiring the next', async () => {
    const model = boundedOver(
      sourceOf({
        async *neighbors() {
          yield { nodeId: 'node:a', label: 'knows' };
          yield { nodeId: 'node:b', label: 'knows' };
        },
      }),
      poolOfOne(),
    );

    const seen: QueryNeighborEntry[] = [];
    for await (const neighbor of model.neighbors('node:one', {} as never)) {
      seen.push(neighbor);
    }

    expect(seen).toHaveLength(2);
  });

  it('releases the lease when a consumer abandons the stream early', async () => {
    const pool = poolOfOne();
    const model = boundedOver(
      sourceOf({
        async *nodes() {
          yield nodeSnapshot('node:one');
          yield nodeSnapshot('node:two');
        },
      }),
      pool,
    );

    for await (const _node of model.nodes({} as never)) {
      break;
    }

    // The abandoned generator must have run its finally; otherwise this throws.
    expect(() => pool.acquire({ scope: 'probe', amount: 1 }).release()).not.toThrow();
  });

  it('releases the lease when the underlying source throws mid-stream', async () => {
    const pool = poolOfOne();
    const model = boundedOver(
      sourceOf({
        async *nodes() {
          yield nodeSnapshot('node:one');
          throw new Error('source failed');
        },
      }),
      pool,
    );

    await expect(async () => {
      for await (const _node of model.nodes({} as never)) {
        // drain until the source throws
      }
    }).rejects.toThrow('source failed');

    expect(() => pool.acquire({ scope: 'probe', amount: 1 }).release()).not.toThrow();
  });

  it('releases the nodeProps lease on success and on failure', async () => {
    const pool = poolOfOne();
    const ok = boundedOver(sourceOf({ async nodeProps() { return { title: 'x' }; } }), pool);

    await expect(ok.nodeProps('node:one')).resolves.toStrictEqual({ title: 'x' });
    expect(() => pool.acquire({ scope: 'probe', amount: 1 }).release()).not.toThrow();

    const failingPool = poolOfOne();
    const failing = boundedOver(
      sourceOf({ async nodeProps() { throw new Error('props failed'); } }),
      failingPool,
    );

    await expect(failing.nodeProps('node:one')).rejects.toThrow('props failed');
    expect(() => failingPool.acquire({ scope: 'probe', amount: 1 }).release()).not.toThrow();
  });

  it('carries the source state hash through unchanged', () => {
    const model = boundedOver(sourceOf({ stateHash: 'abc123' }), poolOfOne());

    expect(model.stateHash).toBe('abc123');
  });

  it('rejects a pool that is not a WarpMemoryPool', () => {
    expect(() => new BoundedQueryReadModel({
      source: sourceOf(),
      // @ts-expect-error deliberate runtime-boundary fixture: not a WarpMemoryPool
      pool: { acquire: () => undefined },
    })).toThrow(MemoryBudgetError);
  });
});
