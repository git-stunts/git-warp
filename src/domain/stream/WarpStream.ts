import WarpError from '../errors/WarpError.ts';
import { checkAborted } from '../utils/cancellation.ts';
import type Transform from './Transform.ts';
import type Sink from './Sink.ts';

/** Validates that a source is a valid iterable. */
function _validateSource(source: unknown): void {
  if (source === null || source === undefined) {
    throw new WarpError('WarpStream requires an async iterable source', 'E_INVALID_SOURCE');
  }
  const s = source as Record<string | symbol, unknown>;
  const hasAsync = typeof s[Symbol.asyncIterator] === 'function';
  const hasSync = typeof s[Symbol.iterator] === 'function';
  if (!hasAsync && !hasSync) {
    throw new WarpError('WarpStream source must implement Symbol.asyncIterator or Symbol.iterator', 'E_INVALID_SOURCE');
  }
}

interface WarpStreamOptions {
  signal?: AbortSignal;
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
 */
export default class WarpStream<T> {
  _source: AsyncIterable<T>;
  _signal: AbortSignal | undefined;

  /**
   * Creates a WarpStream wrapping an async iterable source.
   */
  constructor(source: AsyncIterable<T>, options?: WarpStreamOptions) {
    _validateSource(source);
    this._source = source;
    this._signal = options?.signal;
  }

  // ── Factories ─────────────────────────────────────────────────────

  /**
   * Creates a WarpStream from any iterable or async iterable.
   */
  static from<V>(iterable: AsyncIterable<V> | Iterable<V>, options?: WarpStreamOptions): WarpStream<V> {
    if (iterable instanceof WarpStream) {
      return iterable as WarpStream<V>;
    }
    // Wrap sync iterables as async
    const src = iterable as Record<string | symbol, unknown>;
    if (typeof src[Symbol.asyncIterator] === 'function') {
      return new WarpStream(iterable as AsyncIterable<V>, options);
    }
    if (typeof src[Symbol.iterator] === 'function') {
      return new WarpStream(_syncToAsync(iterable as Iterable<V>), options);
    }
    throw new WarpError('WarpStream.from() requires an iterable or async iterable', 'E_INVALID_SOURCE');
  }

  /**
   * Creates a WarpStream from explicit values.
   */
  static of<V>(...items: V[]): WarpStream<V> {
    return WarpStream.from(items);
  }

  /**
   * Merges multiple streams into one (fan-in).
   *
   * Elements are interleaved in arrival order — whichever source yields
   * next gets emitted next. All sources are consumed concurrently.
   */
  static mux<V>(...streams: WarpStream<V>[]): WarpStream<V> {
    if (streams.length === 0) {
      return WarpStream.from(_empty<V>());
    }
    if (streams.length === 1) {
      return streams[0] as WarpStream<V>;
    }
    return new WarpStream(_muxImpl(streams));
  }

  // ── Composition ───────────────────────────────────────────────────

  /**
   * Pipes this stream through a Transform, producing a new WarpStream.
   */
  pipe<U>(transform: Transform<T, U>): WarpStream<U> {
    if (transform === null || transform === undefined || typeof transform.apply !== 'function') {
      throw new WarpError('pipe() requires a Transform with an apply() method', 'E_INVALID_TRANSFORM');
    }
    const source = this._withCancellation();
    return new WarpStream(transform.apply(source), this._signal !== undefined ? { signal: this._signal } : {});
  }

  /**
   * Splits this stream into two independent branches.
   *
   * Both branches receive all elements. Elements are buffered for the
   * slower branch (one element at a time via the pull protocol).
   */
  tee(): [WarpStream<T>, WarpStream<T>] {
    const source = this._withCancellation();
    const [a, b] = _teeImpl(source);
    const opts: WarpStreamOptions = this._signal !== undefined ? { signal: this._signal } : {};
    return [
      new WarpStream(a, opts),
      new WarpStream(b, opts),
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
   */
  demux(classify: (item: T) => string, keys: string[]): Map<string, WarpStream<T>> {
    if (!Array.isArray(keys) || keys.length === 0) {
      throw new WarpError('demux() requires a non-empty keys array', 'E_INVALID_DEMUX');
    }
    const source = this._withCancellation();
    const branches = _demuxImpl(source, classify, keys);
    const demuxOpts: WarpStreamOptions = this._signal !== undefined ? { signal: this._signal } : {};
    const result = new Map<string, WarpStream<T>>();
    for (const [key, iter] of branches) {
      result.set(key, new WarpStream(iter, demuxOpts));
    }
    return result;
  }

  // ── Terminal Operations ───────────────────────────────────────────

  /**
   * Drains this stream into a Sink and returns the accumulated result.
   */
  async drain<R>(sink: Sink<T, R>): Promise<R> {
    if (sink === null || sink === undefined || typeof sink.consume !== 'function') {
      throw new WarpError('drain() requires a Sink with a consume() method', 'E_INVALID_SINK');
    }
    return await sink.consume(this._withCancellation());
  }

  /**
   * Reduces the stream to a single accumulated value.
   */
  async reduce<R>(fn: (acc: R, item: T) => R | Promise<R>, init: R): Promise<R> {
    let acc = init;
    for await (const item of this._withCancellation()) {
      acc = await fn(acc, item);
    }
    return acc;
  }

  /**
   * Executes a function for each element. Returns when the stream ends.
   */
  async forEach(fn: (item: T) => void | Promise<void>): Promise<void> {
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
   */
  async collect(): Promise<T[]> {
    const items: T[] = [];
    for await (const item of this._withCancellation()) {
      items.push(item);
    }
    return items;
  }

  // ── Interop ───────────────────────────────────────────────────────

  /** Makes WarpStream directly usable in `for await` loops. */
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this._withCancellation()[Symbol.asyncIterator]();
  }

  // ── Internal ──────────────────────────────────────────────────────

  /**
   * Wraps the source with AbortSignal checking if a signal is set.
   */
  _withCancellation(): AsyncIterable<T> {
    if (this._signal === undefined) {
      return this._source;
    }
    return _cancelable(this._source, this._signal);
  }
}

// ── Private Helpers ───────────────────────────────────────────────────

/** Wraps a sync iterable as an async iterable. */
function _syncToAsync<T>(iterable: Iterable<T>): AsyncIterable<T> {
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

/** An empty async iterable. */
async function* _empty<T>(): AsyncIterable<T> {
  // yields nothing
}

/** Wraps an async iterable with AbortSignal cancellation. */
async function* _cancelable<T>(source: AsyncIterable<T>, signal: AbortSignal): AsyncIterable<T> {
  checkAborted(signal);
  for await (const item of source) {
    checkAborted(signal);
    yield item;
  }
}

/** Merges multiple async iterables into one, interleaving by arrival order. */
async function* _muxImpl<T>(streams: WarpStream<T>[]): AsyncIterable<T> {
  const iterators = streams.map((s) => s[Symbol.asyncIterator]());
  const pending = new Map<number, Promise<{ index: number; result: IteratorResult<T> }>>();

  // Start initial pull for each iterator
  for (let i = 0; i < iterators.length; i++) {
    const iter = iterators[i] as AsyncIterator<T>;
    pending.set(i, iter.next().then((result) => ({ index: i, result })));
  }

  while (pending.size > 0) {
    const { index, result } = await Promise.race(pending.values());
    if (result.done === true) {
      pending.delete(index);
    } else {
      yield result.value;
      // Re-arm this iterator for its next value
      const iter = iterators[index] as AsyncIterator<T>;
      pending.set(index, iter.next().then((r) => ({ index, result: r })));
    }
  }
}

/** Tees an async iterable into two independent branches. */
function _teeImpl<T>(source: AsyncIterable<T>): [AsyncIterable<T>, AsyncIterable<T>] {
  const iterator = source[Symbol.asyncIterator]();
  /** Shared cache of items pulled from source, trimmed from the front. */
  const cache: T[] = [];
  /** Offset: the absolute index of cache[0]. */
  let cacheOffset = 0;
  let finished = false;
  let error: Error | null = null;
  /** In-flight pull to prevent concurrent pulls. */
  let inflight: Promise<IteratorResult<T>> | null = null;
  /** Absolute consumed index per branch. */
  const consumed: [number, number] = [0, 0];

  /** Trims cache entries that both branches have consumed. */
  function trimCache(): void {
    const minConsumed = Math.min(consumed[0], consumed[1]);
    const trimCount = minConsumed - cacheOffset;
    if (trimCount > 0) {
      cache.splice(0, trimCount);
      cacheOffset += trimCount;
    }
  }

  /**
   * Ensures the cache covers absolute index `needed - 1`, or source is done.
   * Serializes concurrent pulls via the inflight promise.
   */
  async function ensureCached(needed: number): Promise<void> {
    while (cacheOffset + cache.length < needed && !finished && error === null) {
      if (inflight !== null) {
        await inflight;
        continue;
      }
      inflight = iterator.next();
      try {
        const result = await inflight;
        if (result.done === true) {
          finished = true;
        } else {
          cache.push(result.value);
        }
      } catch (err) {
        error = err as Error;
        finished = true;
      } finally {
        inflight = null;
      }
    }
  }

  /**
   * Creates a branch that reads from the shared cache by absolute index.
   */
  function makeBranch(branchId: number): AsyncIterable<T> {
    let index = 0;
    return {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<T>> {
            await ensureCached(index + 1);
            if (error !== null) { throw error; }
            if (index >= cacheOffset + cache.length) {
              return { value: undefined as T, done: true };
            }
            const value = cache[index - cacheOffset] as T;
            index++;
            consumed[branchId] = index;
            trimCache();
            return { value, done: false };
          },
        };
      },
    };
  }

  return [makeBranch(0), makeBranch(1)];
}

/** Demuxes an async iterable into named branches. */
function _demuxImpl<T>(source: AsyncIterable<T>, classify: (item: T) => string, keys: string[]): Map<string, AsyncIterable<T>> {
  const waiters = new Map<string, Array<{ resolve: (result: IteratorResult<T>) => void; reject: (err: Error) => void }>>();
  const buffers = new Map<string, T[]>();
  let pumpStarted = false;
  let pumpDone = false;
  let pumpError: Error | null = null;

  for (const key of keys) {
    waiters.set(key, []);
    buffers.set(key, []);
  }

  /** Pumps the source and routes elements to branch buffers/waiters. */
  async function pump(): Promise<void> {
    try {
      for await (const item of source) {
        const key = classify(item);
        const keyWaiters = waiters.get(key);
        if (keyWaiters === undefined) {
          continue; // unknown key — drop
        }
        if (keyWaiters.length > 0) {
          const waiter = keyWaiters.shift()!;
          waiter.resolve({ value: item, done: false });
        } else {
          (buffers.get(key) as T[]).push(item);
        }
      }
    } catch (err) {
      pumpError = err as Error;
    } finally {
      pumpDone = true;
      // Signal all waiting branches that the source is done
      for (const [, keyWaiters] of waiters) {
        for (const waiter of keyWaiters) {
          if (pumpError !== null) {
            waiter.reject(pumpError);
          } else {
            waiter.resolve({ value: undefined as T, done: true });
          }
        }
        keyWaiters.length = 0;
      }
    }
  }

  /** Creates a branch async iterable for a given key. */
  function makeBranch(key: string): AsyncIterable<T> {
    return {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<T>> {
            // Start pump on first pull from any branch
            if (!pumpStarted) {
              pumpStarted = true;
              void pump();
            }
            if (pumpError !== null) {
              return Promise.reject(pumpError);
            }
            const buffer = buffers.get(key) as T[];
            if (buffer.length > 0) {
              return Promise.resolve({ value: buffer.shift() as T, done: false });
            }
            if (pumpDone) {
              return Promise.resolve({ value: undefined as T, done: true });
            }
            // Wait for next item routed to this branch
            return new Promise((resolve, reject) => {
              (waiters.get(key) as Array<{ resolve: (result: IteratorResult<T>) => void; reject: (err: Error) => void }>).push({ resolve, reject });
            });
          },
        };
      },
    };
  }

  const result = new Map<string, AsyncIterable<T>>();
  for (const key of keys) {
    result.set(key, makeBranch(key));
  }
  return result;
}
