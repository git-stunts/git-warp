import { describe, expect, it, vi } from 'vitest';

import GitCasSeekCursorStoreAdapter, {
  ACTIVE_SEEK_CURSOR_TTL_MS,
} from '../../../../src/infrastructure/adapters/GitCasSeekCursorStoreAdapter.ts';
import { textEncode } from '../../../../src/domain/utils/bytes.ts';

const ACTIVE_KEY = JSON.stringify([1, 'events', 'active']);
const DAY_MS = 24 * 60 * 60 * 1000;

describe('GitCasSeekCursorStoreAdapter', () => {
  it('retains active cursor pages as pinned entries with a bounded lifetime', async () => {
    const handle = { toString: () => 'page-1' };
    const sweep = vi.fn(async () => ({ removed: 0, generation: 'sweep-1' }));
    const put = vi.fn(async () => ({ accepted: true, generation: 'put-1' }));
    const pagePut = vi.fn(async () => ({ handle }));
    const open = vi.fn(async () => ({
      get: vi.fn(),
      put,
      remove: vi.fn(),
      sweep,
      inspect: vi.fn(),
    }));
    const adapter = new GitCasSeekCursorStoreAdapter({
      cas: {
        caches: { open: open as any },
        pages: {
          put: pagePut as any,
          get: vi.fn() as any,
        },
      },
      graphName: 'events',
      wallClockMs: () => 1_000,
    });

    await adapter.writeActive({
      tick: 12,
      mode: 'all',
      nodes: 3,
      edges: 2,
      frontierHash: 'frontier',
    });

    expect(open).toHaveBeenCalledWith({ namespace: 'git-warp.seek-cursors' });
    expect(sweep).toHaveBeenCalledOnce();
    expect(pagePut).toHaveBeenCalledWith({
      source: textEncode(JSON.stringify({
        tick: 12,
        mode: 'all',
        nodes: 3,
        edges: 2,
        frontierHash: 'frontier',
      })),
      maxBytes: 16 * 1024,
    });
    expect(put).toHaveBeenCalledWith(ACTIVE_KEY, handle, {
      retention: 'pinned',
      expiresAt: new Date(1_000 + ACTIVE_SEEK_CURSOR_TTL_MS).toISOString(),
    });
  });

  it('reads cursor pages without extending cache retention', async () => {
    const get = vi.fn(async () => ({
      handle: { toString: () => 'page-active' },
    }));
    const pageGet = vi.fn(async () => textEncode(JSON.stringify({
      tick: 42,
      mode: 'nodes',
      nodes: 7,
    })));
    const adapter = createAdapter({
      get,
      pageGet,
    });

    await expect(adapter.readActive()).resolves.toEqual({
      tick: 42,
      mode: 'nodes',
      nodes: 7,
    });
    expect(get).toHaveBeenCalledWith(ACTIVE_KEY);
    expect(pageGet).toHaveBeenCalledWith({
      handle: 'page-active',
      maxBytes: 16 * 1024,
    });
  });

  it('lists only this graph saved cursors in stable order across inspection pages', async () => {
    const inspect = vi.fn()
      .mockResolvedValueOnce({
        entries: [
          cacheEntry(JSON.stringify([1, 'events', 'saved', 'zeta']), 'page-zeta'),
          cacheEntry(JSON.stringify([1, 'other', 'saved', 'foreign']), 'page-other'),
          cacheEntry(ACTIVE_KEY, 'page-active'),
        ],
        nextCursor: 'next',
      })
      .mockResolvedValueOnce({
        entries: [
          cacheEntry(JSON.stringify([1, 'events', 'saved', 'alpha']), 'page-alpha'),
          cacheEntry(
            JSON.stringify([1, 'events', 'saved', 'expired']),
            'page-expired',
            new Date(999).toISOString(),
          ),
        ],
        nextCursor: null,
      });
    const pageGet = vi.fn(async ({ handle }: { handle: string }) => {
      const ticks: Readonly<Record<string, number>> = {
        'page-alpha': 1,
        'page-zeta': 9,
      };
      return textEncode(JSON.stringify({ tick: ticks[handle] }));
    });
    const adapter = createAdapter({
      inspect,
      pageGet,
      wallClockMs: () => 1_000,
    });

    await expect(adapter.listSaved()).resolves.toEqual([
      { name: 'alpha', tick: 1 },
      { name: 'zeta', tick: 9 },
    ]);
    expect(inspect).toHaveBeenNthCalledWith(1, { limit: 100, cursor: null });
    expect(inspect).toHaveBeenNthCalledWith(2, { limit: 100, cursor: 'next' });
  });

  it('sweeps once on first use and then at the bounded daily cadence', async () => {
    let nowMs = 1_000;
    const sweep = vi.fn(async () => ({ removed: 0, generation: null }));
    const get = vi.fn(async () => null);
    const adapter = createAdapter({
      get,
      sweep,
      wallClockMs: () => nowMs,
    });

    await adapter.readActive();
    nowMs += DAY_MS - 1;
    await adapter.readActive();
    expect(sweep).toHaveBeenCalledOnce();

    nowMs += 1;
    await adapter.readActive();
    expect(sweep).toHaveBeenCalledTimes(2);
  });

  it('isolates failed opportunistic sweeps and throttles retries', async () => {
    let nowMs = 1_000;
    const sweepFailure = new Error('sweep failed');
    const sweep = vi.fn(async () => {
      throw sweepFailure;
    });
    const get = vi.fn(async () => null);
    const adapter = createAdapter({
      get,
      sweep,
      wallClockMs: () => nowMs,
    });

    await expect(adapter.readActive()).resolves.toBeNull();
    expect(sweep).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledOnce();

    nowMs += 5 * 60 * 1000 - 1;
    await expect(adapter.readActive()).resolves.toBeNull();
    expect(sweep).toHaveBeenCalledOnce();

    nowMs += 1;
    await expect(adapter.readActive()).resolves.toBeNull();
    expect(sweep).toHaveBeenCalledTimes(2);
    await expect(adapter.sweep()).rejects.toBe(sweepFailure);
  });

  it('reports saved-cursor name validation in cursor terms', async () => {
    const adapter = createAdapter({});

    await expect(adapter.readSaved('bad/name')).rejects.toMatchObject({
      code: 'E_INVALID_CURSOR_NAME',
      message: expect.stringContaining('Invalid saved cursor name'),
    });
  });

  it('keeps eager cache-open rejection observable to cursor callers', async () => {
    const openFailure = new Error('open failed');
    const opening = Promise.reject(openFailure);
    const catchSpy = vi.spyOn(opening, 'catch');
    const adapter = new GitCasSeekCursorStoreAdapter({
      cas: {
        caches: { open: (() => opening) as any },
        pages: {
          put: vi.fn() as any,
          get: vi.fn() as any,
        },
      },
      graphName: 'events',
    });

    expect(catchSpy).toHaveBeenCalledOnce();
    await expect(adapter.readActive()).rejects.toBe(openFailure);
  });

  it('fails closed when git-cas declines pinned retention', async () => {
    const adapter = createAdapter({
      put: vi.fn(async () => ({ accepted: false, generation: 'full' })),
      pagePut: vi.fn(async () => ({
        handle: { toString: () => 'page-rejected' },
      })),
    });

    await expect(adapter.writeSaved('bookmark', { tick: 5 })).rejects.toMatchObject({
      code: 'E_CURSOR_RETENTION',
      message: 'git-cas rejected seek cursor retention',
    });
  });
});

type AdapterOverrides = {
  readonly get?: ReturnType<typeof vi.fn>;
  readonly inspect?: ReturnType<typeof vi.fn>;
  readonly pageGet?: ReturnType<typeof vi.fn>;
  readonly pagePut?: ReturnType<typeof vi.fn>;
  readonly put?: ReturnType<typeof vi.fn>;
  readonly sweep?: ReturnType<typeof vi.fn>;
  readonly wallClockMs?: () => number;
};

function createAdapter(overrides: AdapterOverrides): GitCasSeekCursorStoreAdapter {
  const cache = {
    get: overrides.get ?? vi.fn(async () => null),
    inspect: overrides.inspect ?? vi.fn(async () => ({ entries: [], nextCursor: null })),
    put: overrides.put ?? vi.fn(async () => ({ accepted: true, generation: 'put' })),
    remove: vi.fn(async () => ({ removed: true, generation: 'remove' })),
    sweep: overrides.sweep ?? vi.fn(async () => ({ removed: 0, generation: 'sweep' })),
  };
  return new GitCasSeekCursorStoreAdapter({
    cas: {
      caches: { open: (async () => cache) as any },
      pages: {
        get: (overrides.pageGet ?? vi.fn()) as any,
        put: (overrides.pagePut ?? vi.fn()) as any,
      },
    },
    graphName: 'events',
    wallClockMs: overrides.wallClockMs ?? (() => 1_000),
  });
}

function cacheEntry(key: string, handle: string, expiresAt: string | null = null) {
  return {
    key,
    handle,
    retention: 'pinned',
    expiresAt,
    createdAt: '1970-01-01T00:00:00.000Z',
    accessedAt: '1970-01-01T00:00:00.000Z',
  };
}
