import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  openWarp,
  Timeline,
  Warp,
} from '../../../index.ts';
import { MemoryStorageAdapter } from '../../../storage.ts';

function readRepoSource(path: string): string {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
}

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

  it('keeps the v19 facade off the browser root', () => {
    const browserSource = readRepoSource('browser.ts');

    expect(browserSource).not.toContain("export { openWarp }");
    expect(browserSource).not.toContain("export { default as Warp }");
    expect(browserSource).not.toContain("export { default as Timeline }");
    expect(browserSource).not.toContain("export type { OpenWarpOptions, WarpStorage }");
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

  it('keeps worldline openers off the root export surface', async () => {
    const rootModule = await import('../../../index.ts');

    expect('openWarpWorldline' in rootModule).toBe(false);
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

  it('keeps identity validation in the dedicated validator module', () => {
    const warpSource = readRepoSource('src/domain/api/Warp.ts');
    const timelineSource = readRepoSource('src/domain/api/Timeline.ts');
    const validatorSource = readRepoSource('src/domain/api/assertIdentity.ts');

    expect(warpSource).not.toContain('export function assertNonEmpty');
    expect(timelineSource).not.toContain('function assertTimelineIdentity');
    expect(validatorSource).toContain('export function assertIdentity');
  });

  it('rejects invalid public facade constructor options with domain errors', () => {
    expect(() => {
      // @ts-expect-error runtime validation accepts JavaScript callers.
      new Warp(null);
    }).toThrow('Warp requires construction options');

    expect(() => {
      // @ts-expect-error runtime validation accepts JavaScript callers.
      new Warp({ writer: 'agent-1' });
    }).toThrow('Warp requires an openTimeline function');

    expect(() => {
      // @ts-expect-error runtime validation accepts JavaScript callers.
      new Timeline(null);
    }).toThrow('Timeline requires construction options');
  });
});
