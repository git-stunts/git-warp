import { describe, expect, it } from 'vitest';
import {
  collectAsyncIterable,
  isStreamingInput,
  normalizeToAsyncIterable,
} from '../../../../src/domain/utils/streamUtils.ts';

const TEST_BYTE_LIMIT = 32;

describe('stream normalization and bounded collection', () => {
  it('distinguishes streams from buffered values and invalid iterators', () => {
    async function* source() { yield new Uint8Array([1]); }
    expect(isStreamingInput(source())).toBe(true);
    expect(isStreamingInput(new ReadableStream())).toBe(true);
    expect(isStreamingInput(new Uint8Array([1]))).toBe(false);
    expect(isStreamingInput('hello')).toBe(false);
    expect(isStreamingInput({ [Symbol.asyncIterator]: 1 })).toBe(false);
  });

  it('passes through async iterables', () => {
    async function* source() { yield new Uint8Array([1]); }
    const stream = source();
    expect(normalizeToAsyncIterable(stream)).toBe(stream);
  });

  it('encodes strings and drains only once', async () => {
    const iterator = normalizeToAsyncIterable('hi')[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({ value: new TextEncoder().encode('hi'), done: false });
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
  });

  it('copies bytes without retaining a producer-owned view', async () => {
    const chunk = new Uint8Array([5, 6, 7]);
    const result = await collectAsyncIterable(normalizeToAsyncIterable(chunk), TEST_BYTE_LIMIT);
    expect(result).toEqual(chunk);
    expect(result).not.toBe(chunk);
  });

  it('drains readable streams and releases their locks', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array([1, 2])); controller.close(); },
    });
    expect(await collectAsyncIterable(normalizeToAsyncIterable(stream), TEST_BYTE_LIMIT))
      .toEqual(new Uint8Array([1, 2]));
    expect(stream.locked).toBe(false);
  });

  it('cancels upstream and releases the lock on early return', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array([9])); },
      cancel() { cancelled = true; },
    });
    for await (const chunk of normalizeToAsyncIterable(stream)) {
      expect(chunk).toEqual(new Uint8Array([9]));
      break;
    }
    expect(cancelled).toBe(true);
    expect(stream.locked).toBe(false);
  });

  it('propagates reader failure and releases the lock', async () => {
    const failure = new Error('read failed');
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.error(failure); } });
    await expect(collectAsyncIterable(normalizeToAsyncIterable(stream), TEST_BYTE_LIMIT)).rejects.toBe(failure);
    expect(stream.locked).toBe(false);
  });

  it('releases the lock even when cancellation fails', async () => {
    const failure = new Error('cancel failed');
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array([9])); },
      cancel() { throw failure; },
    });
    const iterator = normalizeToAsyncIterable(stream)[Symbol.asyncIterator]();
    await iterator.next();
    await expect(iterator.return?.()).rejects.toBe(failure);
    expect(stream.locked).toBe(false);
  });
});
