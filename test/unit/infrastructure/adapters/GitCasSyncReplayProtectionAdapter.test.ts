import { describe, expect, it, vi } from 'vitest';

import GitCasSyncReplayProtectionAdapter from '../../../../src/infrastructure/adapters/GitCasSyncReplayProtectionAdapter.ts';

describe('GitCasSyncReplayProtectionAdapter', () => {
  it('opens one graph-scoped set and delegates an unambiguous replay identity', async () => {
    const addIfAbsent = vi.fn(async (_key: string, options: { expiresAt: string }) => ({
      admitted: true,
      generation: 'generation-1',
      marker: { expiresAt: options.expiresAt },
    }));
    const sweep = vi.fn(async () => ({
      removed: 2,
      generation: 'generation-2',
    }));
    const open = vi.fn(async () => ({ addIfAbsent, sweep }));
    const adapter = new GitCasSyncReplayProtectionAdapter({
      cas: { expiringSets: { open: open as any } },
      graphName: 'events',
      wallClockMs: () => 1_000,
    });

    const reservation = await adapter.reserve({
      keyId: 'key|with|separators',
      nonce: 'nonce',
      ttlMs: 60_000,
    });

    expect(open).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith({
      namespace: 'git-warp.sync-replay',
    });
    expect(addIfAbsent).toHaveBeenCalledWith(
      JSON.stringify([1, 'events', 'key|with|separators', 'nonce']),
      { expiresAt: new Date(61_000).toISOString() },
    );
    expect(sweep).toHaveBeenCalledOnce();
    expect(reservation).toEqual({
      admitted: true,
      expiresAt: new Date(61_000).toISOString(),
      generation: 'generation-1',
    });
    expect(await adapter.sweep()).toEqual({
      removed: 2,
      generation: 'generation-2',
    });
    expect(sweep).toHaveBeenCalledTimes(2);
  });

  it('returns the retained marker deadline when duplicate admission loses', async () => {
    const retainedExpiry = '2026-07-25T03:00:00.000Z';
    const adapter = new GitCasSyncReplayProtectionAdapter({
      cas: {
        expiringSets: {
          open: (async () => ({
            addIfAbsent: async () => ({
              admitted: false,
              generation: 'generation-existing',
              marker: { expiresAt: retainedExpiry },
            }),
            sweep: async () => ({ removed: 0, generation: null }),
          })) as any,
        },
      },
      graphName: 'events',
      wallClockMs: () => 0,
    });

    await expect(adapter.reserve({
      keyId: 'default',
      nonce: 'duplicate',
      ttlMs: 1,
    })).resolves.toEqual({
      admitted: false,
      expiresAt: retainedExpiry,
      generation: 'generation-existing',
    });
  });

  it('sweeps opportunistically at a bounded production cadence', async () => {
    let nowMs = 1_000;
    const addIfAbsent = vi.fn(async (_key: string, options: { expiresAt: string }) => ({
      admitted: true,
      generation: 'generation-add',
      marker: { expiresAt: options.expiresAt },
    }));
    const sweep = vi.fn(async () => ({ removed: 0, generation: null }));
    const adapter = new GitCasSyncReplayProtectionAdapter({
      cas: {
        expiringSets: {
          open: (async () => ({ addIfAbsent, sweep })) as any,
        },
      },
      graphName: 'events',
      wallClockMs: () => nowMs,
    });
    const request = { keyId: 'default', nonce: 'nonce', ttlMs: 60_000 };

    await adapter.reserve(request);
    nowMs += 60_000;
    await adapter.reserve(request);
    expect(sweep).toHaveBeenCalledOnce();

    nowMs += 10 * 60 * 1000;
    await adapter.reserve(request);
    expect(sweep).toHaveBeenCalledTimes(2);
  });

  it('handles eager open rejection without hiding it from callers', async () => {
    const openFailure = new Error('open failed');
    const opening = Promise.reject(openFailure);
    const catchSpy = vi.spyOn(opening, 'catch');
    const adapter = new GitCasSyncReplayProtectionAdapter({
      cas: {
        expiringSets: {
          open: (() => opening) as any,
        },
      },
      graphName: 'events',
    });

    expect(catchSpy).toHaveBeenCalledOnce();
    await expect(adapter.reserve({
      keyId: 'default',
      nonce: 'nonce',
      ttlMs: 60_000,
    })).rejects.toBe(openFailure);
  });
});
