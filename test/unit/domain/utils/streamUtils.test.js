import { afterEach, describe, expect, it } from 'vitest';
import {
  collectAsyncIterable,
  isStreamingInput,
  normalizeToAsyncIterable,
} from '../../../../src/domain/utils/streamUtils.ts';

const OriginalReadableStream = globalThis.ReadableStream;

afterEach(() => {
  globalThis.ReadableStream = OriginalReadableStream;
});

async function collectChunks(iterable) {
  const chunks = [];
  for await (const chunk of iterable) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('streamUtils', () => {
  it('treats async iterables as streaming input', () => {
    const asyncIterable = {
      async *[Symbol.asyncIterator]() {
        yield new Uint8Array([1, 2, 3]);
      },
    };

    expect(isStreamingInput(asyncIterable)).toBe(true);
    expect(isStreamingInput(new Uint8Array([1, 2, 3]))).toBe(false);
    expect(isStreamingInput('hello')).toBe(false);
  });

  it('returns false for readable streams when the global constructor is unavailable', () => {
    globalThis.ReadableStream = /** @type {typeof ReadableStream} */ (undefined);

    const streamLike = {
      getReader() {
        return {};
      },
    };

    expect(isStreamingInput(streamLike)).toBe(false);
  });

  it('passes through native readable streams that already support async iteration', async () => {
    const source = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.close();
      },
    });

    const normalized = normalizeToAsyncIterable(source);
    const chunks = await collectChunks(normalized);

    expect(chunks).toEqual([new Uint8Array([1, 2])]);
  });

  it('adapts strings to single-value async iterables', async () => {
    const normalized = normalizeToAsyncIterable('hi');
    const iterator = normalized[Symbol.asyncIterator]();

    expect(await iterator.next()).toEqual({
      value: new TextEncoder().encode('hi'),
      done: false,
    });
    expect(await iterator.next()).toEqual({
      value: undefined,
      done: true,
    });
  });

  it('adapts readable streams without Symbol.asyncIterator via getReader()', async () => {
    class FakeReadableStream {
      constructor(chunks) {
        this._chunks = [...chunks];
        this.released = false;
      }

      getReader() {
        return {
          read: async () => {
            if (this._chunks.length === 0) {
              return { value: undefined, done: true };
            }
            return { value: this._chunks.shift(), done: false };
          },
          releaseLock: () => {
            this.released = true;
          },
        };
      }
    }

    globalThis.ReadableStream = FakeReadableStream;

    const stream = new FakeReadableStream([new Uint8Array([3, 4])]);
    const iterator = normalizeToAsyncIterable(stream)[Symbol.asyncIterator]();

    expect(await iterator.next()).toEqual({
      value: new Uint8Array([3, 4]),
      done: false,
    });
    expect(await iterator.next()).toEqual({
      value: undefined,
      done: true,
    });
    expect(stream.released).toBe(true);
  });

  it('releases the reader when iteration is terminated early', async () => {
    class FakeReadableStream {
      constructor(chunks) {
        this._chunks = [...chunks];
        this.released = false;
      }

      getReader() {
        return {
          read: async () => ({ value: this._chunks.shift(), done: false }),
          releaseLock: () => {
            this.released = true;
          },
        };
      }
    }

    globalThis.ReadableStream = FakeReadableStream;

    const stream = new FakeReadableStream([new Uint8Array([9])]);
    const iterator = normalizeToAsyncIterable(stream)[Symbol.asyncIterator]();

    expect(await iterator.next()).toEqual({
      value: new Uint8Array([9]),
      done: false,
    });
    expect(await iterator.return()).toEqual({
      value: undefined,
      done: true,
    });
    expect(stream.released).toBe(true);
  });

  it('collects a single chunk without copying', async () => {
    const chunk = new Uint8Array([5, 6, 7]);
    const iterable = {
      async *[Symbol.asyncIterator]() {
        yield chunk;
      },
    };

    const result = await collectAsyncIterable(iterable);
    expect(result).toBe(chunk);
  });

  it('collects multiple chunks into one Uint8Array', async () => {
    const iterable = {
      async *[Symbol.asyncIterator]() {
        yield new Uint8Array([1, 2]);
        yield new Uint8Array([3, 4, 5]);
      },
    };

    const result = await collectAsyncIterable(iterable);
    expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });
});
