import WarpError from '../errors/WarpError.js';
import { checkAborted } from '../utils/cancellation.js';

/**
 * Validates that a source is a valid iterable.
 * @param {unknown} source
 */
function _validateSource(source) {
  if (source === null || source === undefined) {
    throw new WarpError('WarpStream requires an async iterable source', 'E_INVALID_SOURCE');
  }
  const s = /** @type {Record<string | symbol, unknown>} */ (source);
  const hasAsync = typeof s[Symbol.asyncIterator] === 'function';
  const hasSync = typeof s[Symbol.iterator] === 'function';
  if (!hasAsync && !hasSync) {
    throw new WarpError('WarpStream source must implement Symbol.asyncIterator or Symbol.iterator', 'E_INVALID_SOURCE');
  }
}

/**
 * Composable async stream built on AsyncIterable.
 *
 * WarpStream is the domain concept for "data flow over time." It wraps
 * an AsyncIterable<T> and provides composable operations: pipe, tee,
 * mux, demux, drain.
 *
 * Backpressure is natural via `for await` (pull-based). Error propagation
 * uses the async iterator protocol: downstream throws trigger upstream
 * `return()` for cleanup. Cooperative cancellation via AbortSignal.
 *
 * When the dataset is unbounded, stream-first is not an optimization —
 * it is the honest API.
 *
 * @template T
 */
export default class WarpStream {
  /**
   * Creates a WarpStream wrapping an async iterable source.
   *
   * @param {AsyncIterable<T>} source - The underlying async iterable
   * @param {{ signal?: AbortSignal }} [options]
   */
  constructor(source, { signal } = {}) {
    _validateSource(source);
    /** @type {AsyncIterable<T>} */
    this._source = source;
    /** @type {AbortSignal | undefined} */
    this._signal = signal;
  }

  // ── Factories ─────────────────────────────────────────────────────

  /**
   * Creates a WarpStream from any iterable or async iterable.
   *
   * @template V
   * @param {AsyncIterable<V> | Iterable<V>} iterable
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {WarpStream<V>}
   */
  static from(iterable, options) {
    if (iterable instanceof WarpStream) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- instanceof narrows; cast is correct
      return /** @type {WarpStream<V>} */ (iterable);
    }
    // Wrap sync iterables as async
    if (typeof iterable[Symbol.asyncIterator] === 'function') {
      return new WarpStream(/** @type {AsyncIterable<V>} */ (iterable), options);
    }
    if (typeof iterable[Symbol.iterator] === 'function') {
      return new WarpStream(_syncToAsync(/** @type {Iterable<V>} */ (iterable)), options);
    }
    throw new WarpError('WarpStream.from() requires an iterable or async iterable', 'E_INVALID_SOURCE');
  }

  /**
   * Creates a WarpStream from explicit values.
   *
   * @template V
   * @param  {...V} items
   * @returns {WarpStream<V>}
   */
  static of(...items) {
    return WarpStream.from(items);
  }

  /**
   * Merges multiple streams into one (fan-in).
   *
   * Elements are interleaved in arrival order — whichever source yields
   * next gets emitted next. All sources are consumed concurrently.
   *
   * @template V
   * @param  {...WarpStream<V>} streams
   * @returns {WarpStream<V>}
   */
  static mux(...streams) {
    if (streams.length === 0) {
      return WarpStream.from(/** @type {AsyncIterable<V>} */ (_empty()));
    }
    if (streams.length === 1) {
      return streams[0];
    }
    return new WarpStream(_muxImpl(streams));
  }

  // ── Composition ───────────────────────────────────────────────────

  /**
   * Pipes this stream through a Transform, producing a new WarpStream.
   *
   * @template U
   * @param {import('./Transform.js').default<T, U>} transform
   * @returns {WarpStream<U>}
   */
  pipe(transform) {
    if (transform === null || transform === undefined || typeof transform.apply !== 'function') {
      throw new WarpError('pipe() requires a Transform with an apply() method', 'E_INVALID_TRANSFORM');
    }
    const source = this._withCancellation();
    return new WarpStream(transform.apply(source), { signal: this._signal });
  }

  /**
   * Splits this stream into two independent branches.
   *
   * Both branches receive all elements. Elements are buffered for the
   * slower branch (one element at a time via the pull protocol).
   *
   * @returns {[WarpStream<T>, WarpStream<T>]}
   */
  tee() {
    const source = this._withCancellation();
    const [a, b] = _teeImpl(source);
    return [
      new WarpStream(a, { signal: this._signal }),
      new WarpStream(b, { signal: this._signal }),
    ];
  }

  /**
   * Splits this stream into named branches by a classifier function.
   *
   * Elements are routed to the branch whose key matches the classifier
   * result. Unknown keys are dropped.
   *
   * Note: demux eagerly consumes the source. All branches must be
   * consumed to avoid deadlock. Use for bounded fan-out where you know
   * the key space upfront.
   *
   * @param {(item: T) => string} classify - Returns the branch key for each element
   * @param {string[]} keys - The expected branch keys (must be known upfront)
   * @returns {Map<string, WarpStream<T>>}
   */
  demux(classify, keys) {
    if (!Array.isArray(keys) || keys.length === 0) {
      throw new WarpError('demux() requires a non-empty keys array', 'E_INVALID_DEMUX');
    }
    const source = this._withCancellation();
    const branches = _demuxImpl(source, classify, keys);
    /** @type {Map<string, WarpStream<T>>} */
    const result = new Map();
    for (const [key, iter] of branches) {
      result.set(key, new WarpStream(iter, { signal: this._signal }));
    }
    return result;
  }

  // ── Terminal Operations ───────────────────────────────────────────

  /**
   * Drains this stream into a Sink and returns the accumulated result.
   *
   * @template R
   * @param {import('./Sink.js').default<T, R>} sink
   * @returns {Promise<R>}
   */
  async drain(sink) {
    if (sink === null || sink === undefined || typeof sink.consume !== 'function') {
      throw new WarpError('drain() requires a Sink with a consume() method', 'E_INVALID_SINK');
    }
    return await sink.consume(this._withCancellation());
  }

  /**
   * Reduces the stream to a single accumulated value.
   *
   * @template R
   * @param {(acc: R, item: T) => R | Promise<R>} fn - Reducer function
   * @param {R} init - Initial accumulator value
   * @returns {Promise<R>}
   */
  async reduce(fn, init) {
    let acc = init;
    for await (const item of this._withCancellation()) {
      acc = await fn(acc, item);
    }
    return acc;
  }

  /**
   * Executes a function for each element. Returns when the stream ends.
   *
   * @param {(item: T) => void | Promise<void>} fn
   * @returns {Promise<void>}
   */
  async forEach(fn) {
    for await (const item of this._withCancellation()) {
      await fn(item);
    }
  }

  /**
   * Collects all elements into an array.
   *
   * **DANGER**: This materializes the entire stream. Use only when the
   * result is known to be bounded. For unbounded streams, use forEach(),
   * reduce(), or drain() instead.
   *
   * @returns {Promise<T[]>}
   */
  async collect() {
    /** @type {T[]} */
    const items = [];
    for await (const item of this._withCancellation()) {
      items.push(item);
    }
    return items;
  }

  // ── Interop ───────────────────────────────────────────────────────

  /**
   * Makes WarpStream directly usable in `for await` loops.
   *
   * @returns {AsyncIterator<T>}
   */
  [Symbol.asyncIterator]() {
    return this._withCancellation()[Symbol.asyncIterator]();
  }

  // ── Internal ──────────────────────────────────────────────────────

  /**
   * Wraps the source with AbortSignal checking if a signal is set.
   *
   * @returns {AsyncIterable<T>}
   * @private
   */
  _withCancellation() {
    if (this._signal === undefined) {
      return this._source;
    }
    return _cancelable(this._source, this._signal);
  }
}

// ── Private Helpers ───────────────────────────────────────────────────

/**
 * Wraps a sync iterable as an async iterable.
 *
 * @template T
 * @param {Iterable<T>} iterable
 * @returns {AsyncIterable<T>}
 */
function _syncToAsync(iterable) {
  return {
    [Symbol.asyncIterator]() {
      const iter = iterable[Symbol.iterator]();
      return {
        next() {
          return Promise.resolve(iter.next());
        },
      };
    },
  };
}

/**
 * An empty async iterable.
 *
 * @template T
 * @returns {AsyncIterable<T>}
 */
async function* _empty() {
  // yields nothing
}

/**
 * Wraps an async iterable with AbortSignal cancellation.
 *
 * @template T
 * @param {AsyncIterable<T>} source
 * @param {AbortSignal} signal
 * @returns {AsyncIterable<T>}
 */
async function* _cancelable(source, signal) {
  for await (const item of source) {
    checkAborted(signal);
    yield item;
  }
}

/**
 * Merges multiple async iterables into one, interleaving by arrival order.
 *
 * @template T
 * @param {WarpStream<T>[]} streams
 * @returns {AsyncIterable<T>}
 */
async function* _muxImpl(streams) {
  // Create iterators for all sources
  const iterators = streams.map((s) => s[Symbol.asyncIterator]());
  /** @type {Set<number>} */
  const active = new Set(iterators.map((_, i) => i));

  while (active.size > 0) {
    // Race all active iterators for the next value
    /** @type {Array<Promise<{index: number, result: IteratorResult<T>}>>} */
    const races = [];
    for (const i of active) {
      const iter = iterators[i];
      races.push(
        iter.next().then((result) => ({ index: i, result })),
      );
    }

    const { index, result } = await Promise.race(races);
    if (result.done === true) {
      active.delete(index);
    } else {
      yield result.value;
    }
  }
}

/**
 * Tees an async iterable into two independent branches.
 *
 * @template T
 * @param {AsyncIterable<T>} source
 * @returns {[AsyncIterable<T>, AsyncIterable<T>]}
 */
function _teeImpl(source) {
  const iterator = source[Symbol.asyncIterator]();
  /** @type {Array<{value: T, done: boolean}>} */
  const bufferA = [];
  /** @type {Array<{value: T, done: boolean}>} */
  const bufferB = [];
  let finished = false;
  /** @type {Error | null} */
  let error = null;

  /**
   * Fetches the next item from the shared source.
   * @returns {Promise<IteratorResult<T>>}
   */
  async function pullNext() {
    if (error !== null) {
      throw error;
    }
    if (finished) {
      return { value: /** @type {T} */ (undefined), done: true };
    }
    try {
      const result = await iterator.next();
      if (result.done === true) {
        finished = true;
      }
      return result;
    } catch (err) {
      error = /** @type {Error} */ (err);
      finished = true;
      throw err;
    }
  }

  /**
   * Creates a branch async iterable backed by a shared buffer.
   * @param {Array<{value: T, done: boolean}>} myBuffer
   * @param {Array<{value: T, done: boolean}>} otherBuffer
   * @returns {AsyncIterable<T>}
   */
  function makeBranch(myBuffer, otherBuffer) {
    return {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            if (myBuffer.length > 0) {
              const entry = /** @type {{value: T, done: boolean}} */ (myBuffer.shift());
              return { value: entry.value, done: entry.done };
            }
            const result = await pullNext();
            if (result.done !== true) {
              otherBuffer.push({ value: result.value, done: false });
            }
            return result;
          },
        };
      },
    };
  }

  return [makeBranch(bufferA, bufferB), makeBranch(bufferB, bufferA)];
}

/**
 * Demuxes an async iterable into named branches.
 *
 * @template T
 * @param {AsyncIterable<T>} source
 * @param {(item: T) => string} classify
 * @param {string[]} keys
 * @returns {Map<string, AsyncIterable<T>>}
 */
function _demuxImpl(source, classify, keys) {
  /** @type {Map<string, Array<{resolve: (result: IteratorResult<T>) => void}>>} */
  const waiters = new Map();
  /** @type {Map<string, Array<T>>} */
  const buffers = new Map();
  let pumpStarted = false;
  let pumpDone = false;
  /** @type {Error | null} */
  let pumpError = null;

  for (const key of keys) {
    waiters.set(key, []);
    buffers.set(key, []);
  }

  /**
   * Pumps the source and routes elements to branch buffers/waiters.
   * @returns {Promise<void>}
   */
  async function pump() {
    try {
      for await (const item of source) {
        const key = classify(item);
        const keyWaiters = waiters.get(key);
        if (keyWaiters === undefined) {
          continue; // unknown key — drop
        }
        if (keyWaiters.length > 0) {
          const waiter = /** @type {{resolve: (result: IteratorResult<T>) => void}} */ (keyWaiters.shift());
          waiter.resolve({ value: item, done: false });
        } else {
          /** @type {T[]} */ (buffers.get(key)).push(item);
        }
      }
    } catch (err) {
      pumpError = /** @type {Error} */ (err);
    } finally {
      pumpDone = true;
      // Signal all waiting branches that the source is done
      for (const [, keyWaiters] of waiters) {
        for (const waiter of keyWaiters) {
          if (pumpError !== null) {
            waiter.resolve({ value: /** @type {T} */ (undefined), done: true });
          } else {
            waiter.resolve({ value: /** @type {T} */ (undefined), done: true });
          }
        }
        keyWaiters.length = 0;
      }
    }
  }

  /**
   * Creates a branch async iterable for a given key.
   * @param {string} key
   * @returns {AsyncIterable<T>}
   */
  function makeBranch(key) {
    return {
      [Symbol.asyncIterator]() {
        return {
          next() {
            // Start pump on first pull from any branch
            if (!pumpStarted) {
              pumpStarted = true;
              void pump();
            }
            if (pumpError !== null) {
              return Promise.reject(pumpError);
            }
            const buffer = /** @type {T[]} */ (buffers.get(key));
            if (buffer.length > 0) {
              return Promise.resolve({ value: /** @type {T} */ (buffer.shift()), done: false });
            }
            if (pumpDone) {
              return Promise.resolve({ value: /** @type {T} */ (undefined), done: true });
            }
            // Wait for next item routed to this branch
            return new Promise((resolve) => {
              /** @type {Array<{resolve: (result: IteratorResult<T>) => void}>} */ (waiters.get(key)).push({ resolve });
            });
          },
        };
      },
    };
  }

  /** @type {Map<string, AsyncIterable<T>>} */
  const result = new Map();
  for (const key of keys) {
    result.set(key, makeBranch(key));
  }
  return result;
}
