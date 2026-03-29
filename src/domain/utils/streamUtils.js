/**
 * Stream normalization utilities for content attachment I/O.
 *
 * Domain-only — no Node.js stream imports. Uses AsyncIterable<Uint8Array>
 * as the universal stream type across Node, Bun, and Deno.
 *
 * @module domain/utils/streamUtils
 */

const _encoder = new TextEncoder();

/**
 * Returns true when the value is an async iterable (has Symbol.asyncIterator).
 *
 * @param {unknown} value
 * @returns {value is AsyncIterable<Uint8Array>}
 */
function isAsyncIterable(value) {
  return value !== null
    && typeof value === 'object'
    && Symbol.asyncIterator in /** @type {object} */ (value);
}

/**
 * Returns true when the value is a ReadableStream (Web Streams API).
 *
 * @param {unknown} value
 * @returns {value is ReadableStream<Uint8Array>}
 */
function isReadableStream(value) {
  return typeof ReadableStream !== 'undefined'
    && value instanceof ReadableStream;
}

/**
 * Returns true when the content is a streaming input type
 * (AsyncIterable or ReadableStream) rather than a buffered value.
 *
 * @param {unknown} content
 * @returns {boolean}
 */
export function isStreamingInput(content) {
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
 *
 * @param {AsyncIterable<Uint8Array> | ReadableStream<Uint8Array> | Uint8Array | string} content
 * @returns {AsyncIterable<Uint8Array>}
 */
export function normalizeToAsyncIterable(content) {
  if (isAsyncIterable(content)) {
    return content;
  }

  if (isReadableStream(content)) {
    // ReadableStream implements Symbol.asyncIterator in modern runtimes.
    // For those that don't, use getReader() manually.
    if (Symbol.asyncIterator in content) {
      return /** @type {AsyncIterable<Uint8Array>} */ (content);
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
 *
 * @param {Uint8Array} value
 * @returns {AsyncIterable<Uint8Array>}
 */
function singleValueAsyncIterable(value) {
  return {
    [Symbol.asyncIterator]() {
      let done = false;
      return {
        next() {
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
 *
 * @param {ReadableStream<Uint8Array>} stream
 * @returns {AsyncIterable<Uint8Array>}
 */
function readableStreamToAsyncIterable(stream) {
  return {
    [Symbol.asyncIterator]() {
      const reader = stream.getReader();
      return {
        async next() {
          const { value, done } = await reader.read();
          if (done) {
            reader.releaseLock();
            return { value: undefined, done: true };
          }
          return { value, done: false };
        },
        return() {
          reader.releaseLock();
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };
}
