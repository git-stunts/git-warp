import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWorldlineLane: vi.fn(),
  openStorage: vi.fn(),
  openWarp: vi.fn(),
}));

vi.mock('../../../src/application/GitStorage.ts', () => ({
  default: { open: mocks.openStorage },
}));

vi.mock('../../../src/application/RuntimeLaneAdapter.ts', () => ({
  createWorldlineLane: mocks.createWorldlineLane,
}));

vi.mock('../../../src/application/openWarp.ts', () => ({
  openWarp: mocks.openWarp,
}));

import Runtime from '../../../src/application/Runtime.ts';

describe('Runtime', () => {
  const closeStorage = vi.fn();
  const storage = Object.freeze({ close: closeStorage });
  const timeline = Object.freeze({ name: 'events' });
  const openTimeline = vi.fn();
  const warp = Object.freeze({ timeline: openTimeline, writer: 'agent-1' });
  const lane = Object.freeze({ kind: 'worldline', name: 'events' });

  beforeEach(() => {
    vi.clearAllMocks();
    closeStorage.mockResolvedValue(undefined);
    openTimeline.mockResolvedValue(timeline);
    mocks.openStorage.mockResolvedValue(storage);
    mocks.openWarp.mockResolvedValue(warp);
    mocks.createWorldlineLane.mockReturnValue(lane);
  });

  it('validates public open options before acquiring storage', async () => {
    // @ts-expect-error Exercise the JavaScript boundary.
    await expect(Runtime.open(null)).rejects.toMatchObject({
      code: 'E_RUNTIME_OPEN_OPTIONS',
    });
    await expect(Runtime.open({ at: '', writer: 'agent-1' })).rejects.toThrow(
      'runtime.at must be a non-empty string',
    );
    await expect(Runtime.open({ at: '/repo', writer: '' })).rejects.toMatchObject({
      code: 'E_OPEN_WARP_IDENTITY',
    });
    expect(mocks.openStorage).not.toHaveBeenCalled();
  });

  it('owns storage, opens Lanes, and closes idempotently', async () => {
    const runtime = await Runtime.open({ at: '/repo', writer: 'agent-1' });

    expect(runtime.writer).toBe('agent-1');
    await expect(runtime.lane('events')).resolves.toBe(lane);
    expect(mocks.openStorage).toHaveBeenCalledWith({ cwd: '/repo' });
    expect(mocks.openWarp).toHaveBeenCalledWith({ storage, writer: 'agent-1' });
    expect(openTimeline).toHaveBeenCalledWith('events');
    expect(mocks.createWorldlineLane).toHaveBeenCalledWith(
      timeline,
      expect.any(Object),
    );

    const firstClose = runtime.close();
    const secondClose = runtime.close();
    expect(firstClose).toBe(secondClose);
    await firstClose;
    await runtime[Symbol.asyncDispose]();

    expect(closeStorage).toHaveBeenCalledOnce();
    await expect(runtime.lane('later')).rejects.toMatchObject({
      code: 'E_RUNTIME_CLOSED',
    });
  });

  it('rejects an invalid Lane name without entering runtime activity', async () => {
    const runtime = await Runtime.open({ at: '/repo', writer: 'agent-1' });

    await expect(runtime.lane('')).rejects.toMatchObject({
      code: 'E_LANE_IDENTITY',
      context: { field: 'lane' },
      message: 'Runtime.lane requires a non-empty Lane name',
    });
    expect(openTimeline).not.toHaveBeenCalled();
  });

  it('releases storage when Warp composition fails', async () => {
    const compositionFailure = new Error('composition failed');
    mocks.openWarp.mockRejectedValue(compositionFailure);

    await expect(Runtime.open({ at: '/repo', writer: 'agent-1' }))
      .rejects.toBe(compositionFailure);
    expect(closeStorage).toHaveBeenCalledOnce();
  });

  it('aggregates composition and storage cleanup failures', async () => {
    mocks.openWarp.mockRejectedValue(new Error('composition failed'));
    closeStorage.mockRejectedValue(new Error('storage close failed'));

    const openFailure = await Runtime.open({ at: '/repo', writer: 'agent-1' })
      .catch((error: Error) => error);

    expect(openFailure).toBeInstanceOf(AggregateError);
    expect(openFailure).toMatchObject({
      errors: [
        { message: 'composition failed' },
        { message: 'storage close failed' },
      ],
      message: 'Runtime failed to open and release local resources',
    });
  });
});
