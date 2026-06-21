import { describe, expect, it } from 'vitest';

import AlfredOperationPolicyAdapter from '../../../../src/infrastructure/adapters/AlfredOperationPolicyAdapter.ts';

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of source) {
    values.push(value);
  }
  return values;
}

describe('AlfredOperationPolicyAdapter stream setup policy', () => {
  it('retries stream acquisition before returning an iterable', async () => {
    const policy = new AlfredOperationPolicyAdapter();
    let attempts = 0;

    const stream = await policy.stream(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('resource temporarily unavailable');
      }
      return async function* values(): AsyncIterable<number> {
        yield 1;
        yield 2;
      }();
    }, {
      retries: 1,
      delay: 0,
      maxDelay: 0,
      shouldRetry: () => true,
    });

    await expect(collect(stream)).resolves.toEqual([1, 2]);
    expect(attempts).toBe(2);
  });

  it('does not pull stream chunks before the caller starts iterating', async () => {
    const policy = new AlfredOperationPolicyAdapter();
    let pulls = 0;

    const stream = await policy.stream(async () => async function* values(): AsyncIterable<number> {
      pulls += 1;
      yield 1;
      pulls += 1;
      yield 2;
    }());

    expect(pulls).toBe(0);
    const iterator = stream[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({ value: 1, done: false });
    expect(pulls).toBe(1);
  });

  it('does not retry after a stream has emitted caller-visible values', async () => {
    const policy = new AlfredOperationPolicyAdapter();
    let acquisitions = 0;

    const stream = await policy.stream(async () => {
      acquisitions += 1;
      return async function* values(): AsyncIterable<number> {
        yield 1;
        throw new Error('mid-stream failure');
      }();
    }, {
      retries: 3,
      delay: 0,
      maxDelay: 0,
      shouldRetry: () => true,
    });

    const iterator = stream[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({ value: 1, done: false });
    await expect(iterator.next()).rejects.toThrow('mid-stream failure');
    expect(acquisitions).toBe(1);
  });

  it('preserves the source return path for partial consumption', async () => {
    const policy = new AlfredOperationPolicyAdapter();
    let closed = false;

    const stream = await policy.stream(async () => async function* values(): AsyncIterable<number> {
      try {
        yield 1;
        yield 2;
      } finally {
        closed = true;
      }
    }());

    const iterator = stream[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({ value: 1, done: false });
    await iterator.return?.();
    expect(closed).toBe(true);
  });
});
