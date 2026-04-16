import { describe, it, expect, vi } from 'vitest';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import Transform from '../../../../src/domain/stream/Transform.ts';
import Sink from '../../../../src/domain/stream/Sink.ts';

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Creates an async generator that yields the given items.
 * @param {unknown[]} items
 */
async function* asyncOf(...items) {
  for (const item of items) {
    yield item;
  }
}

/**
 * A simple counting Sink that counts elements and returns the total.
 */
class CountSink extends Sink<any, number> {
  _count: number;
  constructor() {
    super();
    this._count = 0;
  }
  protected override _accept() { this._count++; }
  protected override _finalize() { return this._count; }
}

/**
 * A collecting Sink that accumulates items into an array.
 */
class ArraySink extends Sink<any, any[]> {
  _items: any[];
  constructor() {
    super();
    this._items = [];
  }
  protected override _accept(item: any) { this._items.push(item); }
  protected override _finalize() { return this._items; }
}

// ── WarpStream Construction ───────────────────────────────────────────

describe('WarpStream', () => {
  describe('construction', () => {
    it('accepts an async iterable', () => {
      const s = new WarpStream(asyncOf(1, 2, 3));
      expect(s).toBeInstanceOf(WarpStream);
    });

    it('rejects null source', () => {
      expect(() => new WarpStream((null as any))).toThrow('requires an async iterable');
    });

    it('rejects undefined source', () => {
      expect(() => new WarpStream((undefined as any))).toThrow('requires an async iterable');
    });

    it('rejects non-iterable source', () => {
      expect(() => new WarpStream((42 as any))).toThrow('must implement Symbol.asyncIterator');
    });
  });

  describe('from()', () => {
    it('wraps an async iterable', async () => {
      const s = WarpStream.from(asyncOf(1, 2, 3));
      expect(await s.collect()).toEqual([1, 2, 3]);
    });

    it('wraps a sync iterable (array)', async () => {
      const s = WarpStream.from([1, 2, 3]);
      expect(await s.collect()).toEqual([1, 2, 3]);
    });

    it('returns the same WarpStream if already one', () => {
      const s = WarpStream.from([1, 2]);
      expect(WarpStream.from(s)).toBe(s);
    });

    it('rejects non-iterables', () => {
      expect(() => WarpStream.from((42 as any))).toThrow('requires an iterable');
    });
  });

  describe('of()', () => {
    it('creates a stream from explicit values', async () => {
      const s = WarpStream.of('a', 'b', 'c');
      expect(await s.collect()).toEqual(['a', 'b', 'c']);
    });

    it('creates an empty stream with no args', async () => {
      const s = WarpStream.of();
      expect(await s.collect()).toEqual([]);
    });
  });

  // ── Symbol.asyncIterator ──────────────────────────────────────────

  describe('Symbol.asyncIterator', () => {
    it('works with for-await', async () => {
      const results: number[] = [];
      for await (const item of WarpStream.of(1, 2, 3)) {
        results.push(item);
      }
      expect(results).toEqual([1, 2, 3]);
    });
  });

  // ── pipe() ────────────────────────────────────────────────────────

  describe('pipe()', () => {
    it('transforms each element', async () => {
      const doubled = WarpStream.of(1, 2, 3)
        .pipe(new Transform((x) => x * 2));
      expect(await doubled.collect()).toEqual([2, 4, 6]);
    });

    it('chains multiple transforms', async () => {
      const result = await WarpStream.of(1, 2, 3)
        .pipe(new Transform((x) => x * 2))
        .pipe(new Transform((x) => x + 1))
        .collect();
      expect(result).toEqual([3, 5, 7]);
    });

    it('supports async transform functions', async () => {
      const result = await WarpStream.of(1, 2, 3)
        .pipe(new Transform(async (x) => x * 10))
        .collect();
      expect(result).toEqual([10, 20, 30]);
    });

    it('rejects null transform', () => {
      expect(() => WarpStream.of(1).pipe((null as any))).toThrow('requires a Transform');
    });
  });

  // ── drain() ───────────────────────────────────────────────────────

  describe('drain()', () => {
    it('consumes stream and returns sink result', async () => {
      const count = await WarpStream.of(1, 2, 3).drain(new CountSink());
      expect(count).toBe(3);
    });

    it('calls _accept for each element', async () => {
      const items = await WarpStream.of('a', 'b').drain(new ArraySink());
      expect(items).toEqual(['a', 'b']);
    });

    it('rejects null sink', async () => {
      await expect(WarpStream.of(1).drain((null as any))).rejects.toThrow('requires a Sink');
    });
  });

  // ── reduce() ──────────────────────────────────────────────────────

  describe('reduce()', () => {
    it('reduces to a single value', async () => {
      const sum = await WarpStream.of(1, 2, 3).reduce((acc, x) => acc + x, 0);
      expect(sum).toBe(6);
    });

    it('supports async reducer', async () => {
      const sum = await WarpStream.of(1, 2, 3)
        .reduce(async (acc, x) => acc + x, 0);
      expect(sum).toBe(6);
    });

    it('returns init for empty stream', async () => {
      const result = await WarpStream.of().reduce((acc) => acc, 42);
      expect(result).toBe(42);
    });
  });

  // ── forEach() ─────────────────────────────────────────────────────

  describe('forEach()', () => {
    it('calls function for each element', async () => {
            const seen = ([]) as unknown[];
      await WarpStream.of(1, 2, 3).forEach((x) => { seen.push(x); });
      expect(seen).toEqual([1, 2, 3]);
    });
  });

  // ── collect() ─────────────────────────────────────────────────────

  describe('collect()', () => {
    it('materializes all elements', async () => {
      expect(await WarpStream.of(1, 2, 3).collect()).toEqual([1, 2, 3]);
    });

    it('returns empty array for empty stream', async () => {
      expect(await WarpStream.of().collect()).toEqual([]);
    });
  });

  // ── tee() ─────────────────────────────────────────────────────────

  describe('tee()', () => {
    it('produces two branches with identical elements', async () => {
      const [a, b] = WarpStream.of(1, 2, 3).tee();
      const [ra, rb] = await Promise.all([a.collect(), b.collect()]);
      expect(ra).toEqual([1, 2, 3]);
      expect(rb).toEqual([1, 2, 3]);
    });

    it('both branches are independent WarpStreams', () => {
      const [a, b] = WarpStream.of(1).tee();
      expect(a).toBeInstanceOf(WarpStream);
      expect(b).toBeInstanceOf(WarpStream);
      expect(a).not.toBe(b);
    });
  });

  // ── mux() ─────────────────────────────────────────────────────────

  describe('mux()', () => {
    it('merges multiple streams', async () => {
      const merged = WarpStream.mux(
        WarpStream.of(1, 3, 5),
        WarpStream.of(2, 4, 6),
      );
      const items = await merged.collect();
      // All items present (order may vary due to interleaving)
      expect(items.sort()).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('returns empty for no streams', async () => {
      const merged = WarpStream.mux();
      expect(await merged.collect()).toEqual([]);
    });

    it('returns the single stream for one input', () => {
      const s = WarpStream.of(1);
      expect(WarpStream.mux(s)).toBe(s);
    });
  });

  // ── demux() ───────────────────────────────────────────────────────

  describe('demux()', () => {
    it('routes elements to named branches', async () => {
      const branches = WarpStream.of(
        { type: 'a', value: 1 },
        { type: 'b', value: 2 },
        { type: 'a', value: 3 },
      ).demux((item) => item.type, ['a', 'b']);

      const branchA = (branches.get('a') as WarpStream<any>);
      const branchB = (branches.get('b') as WarpStream<any>);
      const [aItems, bItems] = await Promise.all([
        branchA.collect(),
        branchB.collect(),
      ]);
      expect(aItems).toEqual([{ type: 'a', value: 1 }, { type: 'a', value: 3 }]);
      expect(bItems).toEqual([{ type: 'b', value: 2 }]);
    });

    it('rejects empty keys array', () => {
      expect(() => WarpStream.of(1).demux(() => 'a', [])).toThrow('requires a non-empty keys');
    });

    it('propagates source errors to waiting branches', async () => {
      const source = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'a', value: 1 };
          throw new Error('demux-boom');
        },
      };

      const branches = new WarpStream(source).demux((item) => item.type, ['a', 'b']);
      const errBranchA = (branches.get('a') as WarpStream<any>);
      const errBranchB = (branches.get('b') as WarpStream<any>);

      await expect(
        Promise.all([
          errBranchA.collect(),
          errBranchB.collect(),
        ]),
      ).rejects.toThrow('demux-boom');
    });
  });

  // ── Error Propagation ─────────────────────────────────────────────

  describe('error propagation', () => {
    it('propagates transform errors to the consumer', async () => {
      const s = WarpStream.of(1, 2, 3).pipe(
        new Transform((x) => {
          if (x === 2) { throw new Error('boom'); }
          return x;
        }),
      );
      await expect(s.collect()).rejects.toThrow('boom');
    });

    it('calls upstream return() on downstream error (teardown)', async () => {
      const returnCalled = vi.fn();
      const source = {
        [Symbol.asyncIterator]() {
          let i = 0;
          return {
            async next() {
              if (i >= 3) { return { value: undefined, done: true }; }
              return { value: i++, done: false };
            },
            async return() {
              returnCalled();
              return { value: undefined, done: true };
            },
          };
        },
      };

      const s = new WarpStream(source).pipe(
        new Transform((x) => {
          if (x === 1) { throw new Error('stop'); }
          return x;
        }),
      );

      await expect(s.collect()).rejects.toThrow('stop');
      expect(returnCalled).toHaveBeenCalled();
    });
  });

  // ── AbortSignal Cancellation ──────────────────────────────────────

  describe('AbortSignal cancellation', () => {
    it('aborts mid-stream when signal fires', async () => {
      const controller = new AbortController();
      let count = 0;

      const s = new WarpStream(asyncOf(1, 2, 3, 4, 5), { signal: controller.signal });

      await expect(
        s.forEach(() => {
          count++;
          if (count === 2) { controller.abort(); }
        }),
      ).rejects.toThrow();

      expect(count).toBe(2);
    });
  });
});

// ── Transform ───────────────────────────────────────────────────────

describe('Transform', () => {
  it('requires a function or subclass override', () => {
    expect(() => new Transform((42 as any))).toThrow('requires a function');
  });

  it('apply() throws if no function and not overridden', async () => {
    const t = new Transform();
    const iterable = t.apply(asyncOf(1));
    const iter = iterable[Symbol.asyncIterator]();
    await expect(iter.next()).rejects.toThrow('must be overridden');
  });

  it('subclass can override apply()', async () => {
    class DoubleTransform extends Transform<number, number> {
      override async *apply(source: AsyncIterable<number>) {
        for await (const item of source) {
          yield item;
          yield item;
        }
      }
    }

    const result = await WarpStream.of(1, 2)
      .pipe(new DoubleTransform())
      .collect();
    expect(result).toEqual([1, 1, 2, 2]);
  });
});

// ── Sink ────────────────────────────────────────────────────────────

describe('Sink', () => {
  it('_accept throws if not overridden', () => {
    const s = new (Sink as any)();
    expect(() => (s as any)._accept(1)).toThrow('not implemented');
  });

  it('_finalize throws if not overridden', () => {
    const s = new (Sink as any)();
    expect(() => (s as any)._finalize()).toThrow('not implemented');
  });

  it('consume() calls _accept for each item and _finalize at end', async () => {
    const sink = new ArraySink();
    const result = await (sink as any).consume(asyncOf('x', 'y'));
    expect(result).toEqual(['x', 'y']);
  });

  it('consume() rejects nullish sources', async () => {
    const sink = new ArraySink();
    await expect((sink as any).consume(undefined))
      .rejects.toThrow('Sink.consume() requires a source');
  });
});
