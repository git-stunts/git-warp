/**
 * Stream normalization utilities for content attachment I/O.
 *
 * Domain-only — no Node.js stream imports. Uses AsyncIterable<Uint8Array>
 * as the universal stream type across Node, Bun, and Deno.
 *
 * @module domain/utils/streamUtils
 */

const _encoder = new TextEncoder();

type StreamInput = AsyncIterable<Uint8Array>
  | ReadableStream<Uint8Array>
  | Uint8Array
  | string;
type StreamCandidate = StreamInput | object;

/**
 * Returns true when the value is an async iterable (has Symbol.asyncIterator).
 */
function isAsyncIterable(value: StreamCandidate): value is AsyncIterable<Uint8Array> {
  return value !== null
    && typeof value === 'object'
    && Symbol.asyncIterator in value
    && typeof value[Symbol.asyncIterator] === 'function';
}

/**
 * Returns true when the value is a ReadableStream (Web Streams API).
 */
function isReadableStream(value: StreamCandidate): value is ReadableStream<Uint8Array> {
  return typeof ReadableStream !== 'undefined'
    && value instanceof ReadableStream;
}

/**
 * Returns true when the content is a streaming input type
 * (AsyncIterable or ReadableStream) rather than a buffered value.
 */
export function isStreamingInput(
  content: StreamCandidate,
): content is AsyncIterable<Uint8Array> | ReadableStream<Uint8Array> {
  // Buffered types are never streaming, even if a polyfill adds Symbol.asyncIterator
  if (content instanceof Uint8Array || typeof content === 'string') {
    return false;
  }
  return isAsyncIterable(content) || isReadableStream(content);
}

/**
 * Normalizes any supported content input to AsyncIterable<Uint8Array>.
 *
 * Accepted input types:
 * - `AsyncIterable<Uint8Array>` — passed through
 * - `ReadableStream<Uint8Array>` — adapted via async iteration protocol
 * - `Uint8Array` — wrapped as single-element async iterable
 * - `string` — encoded to UTF-8, wrapped as single-element async iterable
 */
export function normalizeToAsyncIterable(content: StreamInput): AsyncIterable<Uint8Array> {
  if (isAsyncIterable(content)) {
    return content;
  }

  if (isReadableStream(content)) {
    // ReadableStream implements Symbol.asyncIterator in modern runtimes.
    // For those that don't, use getReader() manually.
    if (Symbol.asyncIterator in content) {
      return content as AsyncIterable<Uint8Array>;
    }
    return readableStreamToAsyncIterable(content);
  }

  const bytes = typeof content === 'string'
    ? _encoder.encode(content)
    : content;

  return singleValueAsyncIterable(bytes);
}

/**
 * Wraps a single Uint8Array as an async iterable yielding one chunk.
 */
function singleValueAsyncIterable(value: Uint8Array): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]() {
      let done = false;
      return {
        next(): Promise<IteratorResult<Uint8Array>> {
          if (done) {
            return Promise.resolve({ value: undefined, done: true });
          }
          done = true;
          return Promise.resolve({ value, done: false });
        },
      };
    },
  };
}

/**
 * Adapts a ReadableStream to an async iterable via getReader().
 */
function readableStreamToAsyncIterable(stream: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]() {
      const reader = stream.getReader();
      return {
        async next(): Promise<IteratorResult<Uint8Array>> {
          const { value, done } = await reader.read();
          if (done) {
            reader.releaseLock();
            return { value: undefined, done: true };
          }
          return { value, done: false };
        },
        return(): Promise<IteratorResult<Uint8Array>> {
          reader.releaseLock();
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };
}

/**
 * Collects an async iterable into a single Uint8Array.
 */
export async function collectAsyncIterable(source: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  for await (const chunk of source) {
    chunks.push(chunk);
    totalLength += chunk.byteLength;
  }
  if (chunks.length === 1) {
    return chunks[0]!;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
