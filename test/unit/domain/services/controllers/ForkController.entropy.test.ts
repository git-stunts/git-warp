import { beforeEach, describe, expect, it, vi } from 'vitest';

import ForkController from '../../../../../src/domain/services/controllers/ForkController.ts';
import EntropyError from '../../../../../src/domain/errors/EntropyError.ts';
import { buildWriterRef } from '../../../../../src/domain/utils/RefLayout.ts';
import type RandomPort from '../../../../../src/ports/RandomPort.ts';
import SequenceRandomPort from '../../../../helpers/SequenceRandomPort.ts';

const mockRuntimeOpen = vi.fn();
vi.mock('../../../../../src/domain/warp/RuntimeHostProduct.ts', () => ({
  openRuntimeHostProduct: (...args) => mockRuntimeOpen(...args),
}));

/** Fork suffix from bytes 0x00..0x03. */
const SEQUENCE_FORK_NAME = 'test-graph-fork-00010203';
/** Writer id from the next sixteen bytes, 0x04..0x13. */
const SEQUENCE_FORK_WRITER = 'w_0g2gc1r81450p30d1r7h048j2c';

class ShortRandomPort implements RandomPort {
  randomBytes(length: number): Uint8Array {
    return new Uint8Array(length - 1);
  }
}

function createHost(random: RandomPort) {
  return {
    _graphName: 'test-graph',
    _persistence: {
      readRef: vi.fn().mockResolvedValue('tip-sha'),
      nodeExists: vi.fn().mockResolvedValue(true),
      getNodeInfo: vi.fn().mockResolvedValue({ parents: [] }),
      updateRef: vi.fn().mockResolvedValue(undefined),
      deleteRef: vi.fn().mockResolvedValue(undefined),
      listRefs: vi.fn().mockResolvedValue([]),
    },
    _runtimeStorage: { prepareFreshTimeline: vi.fn().mockResolvedValue(undefined) },
    discoverWriters: vi.fn().mockResolvedValue(['alice']),
    _gcPolicy: null,
    _checkpointPolicy: null,
    _autoMaterialize: false,
    _onDeleteWithData: 'warn',
    _logger: null,
    _crypto: null,
    _random: random,
    _codec: null,
    _assetStorage: null,
    _patchJournal: null,
    _commitMessageCodec: null,
  };
}

/** Mirrors ForkController.test.ts: the structural host stays loosely typed. */
function controllerFor(host) {
  return new ForkController(host);
}

async function forkWith(random: RandomPort) {
  const host = createHost(random);
  const ctrl = controllerFor(host);
  await ctrl.fork({ from: 'alice', at: 'tip-sha' });
  return { host, open: mockRuntimeOpen.mock.calls.at(-1)?.[0] };
}

describe('ForkController entropy', () => {
  beforeEach(() => {
    mockRuntimeOpen.mockReset();
    mockRuntimeOpen.mockResolvedValue({ _graphName: 'forked' });
  });

  it('derives the fork name and fork writer id only from the injected port', async () => {
    const random = new SequenceRandomPort(0);

    const { host, open } = await forkWith(random);

    expect(open.graphName).toBe(SEQUENCE_FORK_NAME);
    expect(open.writerId).toBe(SEQUENCE_FORK_WRITER);
    expect(random.requests).toEqual([4, 16]);
    expect(host._persistence.updateRef)
      .toHaveBeenCalledWith(buildWriterRef(SEQUENCE_FORK_NAME, SEQUENCE_FORK_WRITER), 'tip-sha');
  });

  it('replays to the same fork identity from the same entropy', async () => {
    const first = await forkWith(new SequenceRandomPort(0));
    const second = await forkWith(new SequenceRandomPort(0));

    expect(second.open.graphName).toBe(first.open.graphName);
    expect(second.open.writerId).toBe(first.open.writerId);
  });

  it('hands the same port to the forked runtime', async () => {
    const random = new SequenceRandomPort(0);

    const { open } = await forkWith(random);

    expect(open.random).toBe(random);
  });

  it('draws no entropy when the caller names the fork and its writer', async () => {
    const random = new SequenceRandomPort(0);
    const host = createHost(random);
    const ctrl = controllerFor(host);

    await ctrl.fork({ from: 'alice', at: 'tip-sha', forkName: 'named', forkWriterId: 'bob' });

    expect(random.requests).toEqual([]);
  });

  it('fails before writing any ref when the port returns too few bytes', async () => {
    const host = createHost(new ShortRandomPort());
    const ctrl = controllerFor(host);

    await expect(ctrl.fork({ from: 'alice', at: 'tip-sha' })).rejects.toBeInstanceOf(EntropyError);
    expect(host._persistence.updateRef).not.toHaveBeenCalled();
  });
});
