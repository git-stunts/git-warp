import { describe, expect, it } from 'vitest';

import {
  openWarp,
  Timeline,
  Warp,
} from '../../../index.ts';
import { MemoryStorageAdapter } from '../../../storage.ts';

describe('v19 Warp facade', () => {
  it('opens named timelines through root application nouns', async () => {
    const warp = await openWarp({
      storage: new MemoryStorageAdapter(),
      writer: 'agent-1',
    });

    const timeline = await warp.timeline('events');

    expect(warp).toBeInstanceOf(Warp);
    expect(Object.isFrozen(warp)).toBe(true);
    expect(warp.writer).toBe('agent-1');
    expect(timeline).toBeInstanceOf(Timeline);
    expect(Object.isFrozen(timeline)).toBe(true);
    expect(timeline.name).toBe('events');
    expect(timeline.writer).toBe('agent-1');
  });

  it('exports the same facade from the browser root', async () => {
    const {
      openWarp: openBrowserWarp,
      Timeline: BrowserTimeline,
      Warp: BrowserWarp,
    } = await import('../../../browser.ts');

    expect(openBrowserWarp).toBe(openWarp);
    expect(BrowserWarp).toBe(Warp);
    expect(BrowserTimeline).toBe(Timeline);
  });

  it('keeps internal history vocabulary off the public facade objects', async () => {
    const warp = await openWarp({
      storage: new MemoryStorageAdapter(),
      writer: 'agent-1',
    });
    const timeline = await warp.timeline('events');

    expect('worldlineName' in timeline).toBe(false);
    expect('writerId' in timeline).toBe(false);
    expect('commit' in timeline).toBe(false);
    expect('live' in timeline).toBe(false);
    expect('optic' in timeline).toBe(false);
  });

  it('rejects missing storage and blank identities', async () => {
    await expect(openWarp({
      // @ts-expect-error runtime validation accepts JavaScript callers.
      storage: null,
      writer: 'agent-1',
    })).rejects.toThrow('openWarp requires storage');

    await expect(openWarp({
      storage: new MemoryStorageAdapter(),
      writer: '   ',
    })).rejects.toThrow('openWarp requires non-empty identity fields');

    const warp = await openWarp({
      storage: new MemoryStorageAdapter(),
      writer: 'agent-1',
    });

    await expect(warp.timeline('')).rejects.toThrow('openWarp requires non-empty identity fields');
  });
});
