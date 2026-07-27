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
import Lane, { type LaneDescriptor } from '../../../src/domain/api/Lane.ts';
import { bindLaneRuntime } from '../../../src/domain/api/LaneRuntime.ts';

describe('Runtime', () => {
  const closeStorage = vi.fn();
  const storage = Object.freeze({ close: closeStorage });
  const timeline = Object.freeze({ name: 'events' });
  const openTimeline = vi.fn();
  const warp = Object.freeze({ timeline: openTimeline, writer: 'agent-1' });
  const forkLane = vi.fn();
  const openStrandLane = vi.fn();
  let lane: Lane;
  let runtimeOwner: object;

  beforeEach(() => {
    vi.clearAllMocks();
    closeStorage.mockResolvedValue(undefined);
    openTimeline.mockResolvedValue(timeline);
    mocks.openStorage.mockResolvedValue(storage);
    mocks.openWarp.mockResolvedValue(warp);
    forkLane.mockReset();
    openStrandLane.mockReset();
    mocks.createWorldlineLane.mockImplementation((_timeline, _activity, options: {
      readonly owner: object;
    }) => {
      runtimeOwner = options.owner;
      lane = createBoundLane({
        descriptor: { kind: 'worldline', name: 'events' },
        fork: forkLane,
        openStrand: openStrandLane,
        owner: options.owner,
      });
      return lane;
    });
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
    const openedLane = await runtime.lane('events');
    expect(openedLane).toBe(lane);
    expect(mocks.openStorage).toHaveBeenCalledWith({ cwd: '/repo' });
    expect(mocks.openWarp).toHaveBeenCalledWith({ storage, writer: 'agent-1' });
    expect(openTimeline).toHaveBeenCalledWith('events');
    expect(mocks.createWorldlineLane).toHaveBeenCalledWith(
      timeline,
      expect.any(Object),
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

  it('forks only worldline Lanes owned by the same open Runtime', async () => {
    const runtime = await Runtime.open({ at: '/repo', writer: 'agent-1' });
    const source = await runtime.lane('events');
    const strand = createBoundLane({
      descriptor: {
        kind: 'strand',
        name: 'try-admin',
        parent: source.reference,
        forkedAt: { id: 'tick:1', lane: source.reference },
      },
      fork: null,
      openStrand: null,
      owner: runtimeOwner,
    });
    forkLane.mockResolvedValue(strand);

    await expect(runtime.fork(source, { name: 'try-admin' })).resolves.toBe(strand);
    expect(forkLane).toHaveBeenCalledWith('try-admin');

    await expect(runtime.fork(strand, { name: 'nested' })).rejects.toMatchObject({
      code: 'E_RUNTIME_FORK_SOURCE_KIND',
      context: { kind: 'strand' },
    });
    const foreign = createBoundLane({
      descriptor: { kind: 'worldline', name: 'foreign' },
      fork: vi.fn(),
      openStrand: vi.fn(),
      owner: {},
    });
    await expect(runtime.fork(foreign, { name: 'foreign-draft' }))
      .rejects.toMatchObject({ code: 'E_RUNTIME_FORK_FOREIGN_LANE' });
  });

  it('opens persisted strands only under an owned worldline Lane', async () => {
    const runtime = await Runtime.open({ at: '/repo', writer: 'agent-1' });
    const parent = await runtime.lane('events');
    const strand = createBoundLane({
      descriptor: {
        kind: 'strand',
        name: 'try-admin',
        parent: parent.reference,
        forkedAt: { id: 'tick:1', lane: parent.reference },
      },
      fork: null,
      openStrand: null,
      owner: runtimeOwner,
    });
    openStrandLane.mockResolvedValue(strand);

    await expect(runtime.strand(parent, { name: 'try-admin' }))
      .resolves.toBe(strand);
    expect(openStrandLane).toHaveBeenCalledWith('try-admin');
    await expect(runtime.strand(strand, { name: 'nested' }))
      .rejects.toMatchObject({ code: 'E_RUNTIME_STRAND_PARENT_KIND' });
    await expect(runtime.strand(parent, { name: '' }))
      .rejects.toMatchObject({
        code: 'E_RUNTIME_STRAND_IDENTITY',
        context: { field: 'strand.name' },
      });
  });

  it('validates fork arguments and rejects fork work after close', async () => {
    const runtime = await Runtime.open({ at: '/repo', writer: 'agent-1' });
    const source = await runtime.lane('events');

    // @ts-expect-error Exercise the JavaScript boundary.
    await expect(runtime.fork({}, { name: 'draft' })).rejects.toMatchObject({
      code: 'E_RUNTIME_FORK_SOURCE',
    });
    // @ts-expect-error Exercise the JavaScript boundary.
    await expect(runtime.fork(source, null)).rejects.toMatchObject({
      code: 'E_RUNTIME_FORK_OPTIONS',
    });
    await expect(runtime.fork(source, { name: '' })).rejects.toMatchObject({
      code: 'E_RUNTIME_FORK_IDENTITY',
      context: { field: 'fork.name' },
    });

    await runtime.close();
    await expect(runtime.fork(source, { name: 'later' })).rejects.toMatchObject({
      code: 'E_RUNTIME_CLOSED',
    });
    expect(forkLane).not.toHaveBeenCalled();
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

function createBoundLane(options: {
  readonly descriptor: LaneDescriptor;
  readonly fork: ((name: string) => Promise<Lane>) | null;
  readonly openStrand?: ((name: string) => Promise<Lane>) | null;
  readonly owner: object;
}): Lane {
  const lane = new Lane({
    descriptor: options.descriptor,
    writer: 'agent-1',
    startObserver: async () => {
      throw new Error('not exercised');
    },
    writeIntent: async () => {
      throw new Error('not exercised');
    },
  });
  bindLaneRuntime(lane, {
    captureCoordinate: async () => {
      throw new Error('not exercised');
    },
    fork: options.fork,
    openStrand: options.openStrand ?? null,
    owner: options.owner,
    settlement: Object.freeze({ kind: 'target' }),
  });
  return lane;
}
