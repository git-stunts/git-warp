import { describe, expect, it } from 'vitest';
import { collectAsyncIterable } from '../../../../src/domain/utils/streamUtils.ts';

describe('explicit byte collection bounds', () => {
  it('rejects overflow and closes the producer before accepting excess bytes', async () => {
    let closed = false;
    async function* source() {
      try {
        yield new Uint8Array([1, 2]);
        yield new Uint8Array([3, 4]);
        throw new Error('must not resume after overflow');
      } finally { closed = true; }
    }
    await expect(collectAsyncIterable(source(), 3)).rejects.toMatchObject({ code: 'E_BYTE_COLLECTION_LIMIT' });
    expect(closed).toBe(true);
  });

  it.each([undefined, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid limit %s before starting the producer', async (limit) => {
      let started = false;
      async function* source() { started = true; yield new Uint8Array([1]); }
      await expect(collectAsyncIterable(source(), limit)).rejects.toMatchObject({ code: 'E_BYTE_COLLECTION_LIMIT' });
      expect(started).toBe(false);
    },
  );

  it('accepts exact bounds and snapshots reused producer buffers', async () => {
    async function* source() {
      const chunk = new Uint8Array([1, 2]);
      yield chunk;
      chunk.set([3, 4]);
      yield chunk;
    }
    expect(await collectAsyncIterable(source(), 4)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('allows zero bytes and ignores empty chunks', async () => {
    async function* source() { yield new Uint8Array(); yield new Uint8Array(); }
    expect(await collectAsyncIterable(source(), 0)).toEqual(new Uint8Array());
  });

  it('preserves producer failure identity', async () => {
    const failure = new Error('producer failed');
    async function* source() { yield new Uint8Array([1]); throw failure; }
    await expect(collectAsyncIterable(source(), 10)).rejects.toBe(failure);
  });
});
