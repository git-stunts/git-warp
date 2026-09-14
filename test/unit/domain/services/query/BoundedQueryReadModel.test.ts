import { describe, expect, it } from 'vitest';

import MemoryBudgetError from '../../../../../src/domain/errors/MemoryBudgetError.ts';
import MemoryBudget from '../../../../../src/domain/memory/MemoryBudget.ts';
import WarpMemoryPool from '../../../../../src/domain/memory/WarpMemoryPool.ts';
import BoundedQueryReadModel from '../../../../../src/domain/services/query/BoundedQueryReadModel.ts';

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

type QueryReadModelStub = {
  stateHash: string;
  nodes: (...args: readonly unknown[]) => AsyncIterable<unknown>;
  neighbors: (...args: readonly unknown[]) => AsyncIterable<unknown>;
  nodeProps: (...args: readonly unknown[]) => Promise<unknown>;
};

function boundedOver(source: QueryReadModelStub, pool: WarpMemoryPool): BoundedQueryReadModel {
  return new BoundedQueryReadModel({
    source: source as unknown as ConstructorParameters<typeof BoundedQueryReadModel>[0]['source'],
    pool,
  });
}

describe('BoundedQueryReadModel lease discipline', () => {
  it('releases each node lease before acquiring the next, under a budget of one', async () => {
    const model = boundedOver(
      sourceOf({
        async *nodes() {
          yield { id: 'node:one' };
          yield { id: 'node:two' };
          yield { id: 'node:three' };
        },
      }),
      poolOfOne(),
    );

    const seen: unknown[] = [];
    for await (const node of model.nodes({} as never)) {
      seen.push(node);
    }

    expect(seen).toHaveLength(3);
  });

  it('releases each neighbor lease before acquiring the next', async () => {
    const model = boundedOver(
      sourceOf({
        async *neighbors() {
          yield { nodeId: 'node:a' };
          yield { nodeId: 'node:b' };
        },
      }),
      poolOfOne(),
    );

    const seen: unknown[] = [];
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
          yield { id: 'node:one' };
          yield { id: 'node:two' };
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
          yield { id: 'node:one' };
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
      source: sourceOf() as unknown as ConstructorParameters<typeof BoundedQueryReadModel>[0]['source'],
      pool: { acquire: () => undefined } as unknown as WarpMemoryPool,
    })).toThrow(MemoryBudgetError);
  });
});
