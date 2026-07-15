import { describe, expect, it, vi } from 'vitest';

import {
  openMemoryRuntimeHostProduct as openRuntimeHostProduct,
  openMemoryWarpCore,
  openMemoryWarpGraph as openWarpGraph,
} from '../../helpers/MemoryRuntimeHost.ts';
import StrandError from '../../../src/domain/errors/StrandError.ts';
import RuntimeDetachedFactory from '../../../src/domain/warp/RuntimeDetachedFactory.ts';
import RuntimePatchCollector from '../../../src/domain/warp/RuntimePatchCollector.ts';
import InMemoryGraphAdapter from '../../../test/helpers/InMemoryGraphAdapter.ts';
import MemoryRuntimeStorageAdapter from '../../../test/helpers/MemoryRuntimeStorageAdapter.ts';
import defaultCrypto from '../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import GCPolicy from '../../../src/domain/services/GCPolicy.ts';

import type {
  DetachedGraphOpen,
  DetachedOpenHost,
  DetachedOpenOptions,
} from '../../../src/domain/services/controllers/detachedOpen.ts';
import type { DetachedGraphInternalReadSurface } from '../../../src/domain/capabilities/DetachedGraphFactory.ts';

describe('strand and runtime host seams', () => {
  it('uses StrandError as the public speculative-lane error noun', () => {
    const error = new StrandError('invalid strand id', {
      code: 'E_STRAND_ID_INVALID',
      context: { strandId: '' },
    });

    expect(error).toBeInstanceOf(StrandError);
    expect(error.name).toBe('StrandError');
    expect(error.code).toBe('E_STRAND_ID_INVALID');
    expect(error.context).toEqual({ strandId: '' });
  });

  it('creates, patches, braids, and materializes strands through WarpCore', async () => {
    const core = await openMemoryWarpCore({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'strand-public-surface',
      writerId: 'agent-1',
    });

    const descriptor = await core.createStrand({
      strandId: 'review',
      owner: 'agent-1',
    });
    await core.patchStrand('review', (patch) => {
      patch.addNode('task:review').setProperty('task:review', 'status', 'draft');
    });
    const braided = await core.braidStrand('review', { writable: false });
    const materialized = await core.materializeStrand('review');
    const patches = await core.getStrandPatches('review');
    const entityPatches = await core.patchesForStrand('review', 'task:review');

    expect(descriptor.strandId).toBe('review');
    expect(descriptor.owner).toBe('agent-1');
    expect(braided.overlay.writable).toBe(false);
    expect(materialized.nodeAlive.contains('task:review')).toBe(true);
    expect(patches).toHaveLength(1);
    expect(entityPatches).toEqual([requireSinglePatchSha(patches)]);
    await expect(core.getStrand('review')).resolves.toMatchObject({
      strandId: 'review',
      overlay: { patchCount: 1, writable: false },
    });
    await expect(core.listStrands()).resolves.toEqual([
      expect.objectContaining({ strandId: 'review' }),
    ]);
  });

  it('opens runtime products, compatibility bags, and forks through the shared host opener', async () => {
    const persistence = new InMemoryGraphAdapter();
    const runtime = await openRuntimeHostProduct({
      persistence,
      graphName: 'runtime-product',
      writerId: 'agent-1',
    });
    const sha = await runtime.patch((patch) => {
      patch.addNode('node:base');
    });

    const fork = await runtime.fork({
      from: 'agent-1',
      at: sha,
      forkName: 'runtime-product-fork',
      forkWriterId: 'fork-writer',
    });
    await fork.materialize();

    const graph = await openWarpGraph({
      persistence,
      graphName: 'runtime-product',
      writerId: 'agent-2',
    });

    expect(fork.graphName).toBe('runtime-product-fork');
    expect(fork.writerId).toBe('fork-writer');
    expect(fork.persistence).toBe(runtime.persistence);
    await expect(fork.hasNode('node:base')).resolves.toBe(true);
    expect(graph.graphName).toBe('runtime-product');
    expect(Object.isFrozen(graph)).toBe(true);
    expect(graph.commitment.patches).toBe(graph.patches);
    expect(graph.revelation.query).toBe(graph.query);
  });

  it('opens detached read-only runtime clones through the detached factory wrapper', async () => {
    const host = createDetachedHost();
    const readSurface = createDetachedReadSurface();
    const open = vi.fn<DetachedGraphOpen>(async () => readSurface);

    const detached = await new RuntimeDetachedFactory(host, open).openReadOnly();
    const options = requireDetachedOpenOptions(open);

    expect(detached).toBe(readSurface);
    expect(options).toMatchObject({
      persistence: host._persistence,
      runtimeStorage: host._runtimeStorage,
      graphName: 'detached-runtime',
      writerId: 'agent-1',
      gcPolicy: GCPolicy.DEFAULT,
      autoMaterialize: false,
      onDeleteWithData: 'reject',
      crypto: defaultCrypto,
      codec: defaultCodec,
      audit: false,
    });
    expect(options.trust).toEqual({ mode: 'off', pin: null });
  });

  it('delegates patch collection through a strict runtime host wrapper', async () => {
    const frontier = new Map([['agent-1', 'a'.repeat(40)]]);
    const host = {
      discoverWriters: vi.fn(async () => ['agent-1']),
      _loadWriterPatches: vi.fn(async () => []),
      _loadPatchChainFromSha: vi.fn(async () => []),
      _loadLatestCheckpoint: vi.fn(async () => null),
      _loadPatchesSince: vi.fn(async () => []),
      getFrontier: vi.fn(async () => frontier),
    };
    const collector = new RuntimePatchCollector(host);

    await expect(collector.discoverWriters()).resolves.toEqual(['agent-1']);
    await expect(collector.loadWriterPatches('agent-1')).resolves.toEqual([]);
    await expect(collector.loadPatchChain('a'.repeat(40))).resolves.toEqual([]);
    await expect(collector.loadCheckpoint()).resolves.toBeNull();
    await expect(collector.getFrontier()).resolves.toBe(frontier);
    expect(host._loadWriterPatches).toHaveBeenCalledWith('agent-1');
    expect(host._loadPatchChainFromSha).toHaveBeenCalledWith('a'.repeat(40), undefined);
  });
});

function createDetachedHost(): DetachedOpenHost {
  const persistence = new InMemoryGraphAdapter();
  return {
    _persistence: persistence,
    _runtimeStorage: new MemoryRuntimeStorageAdapter({ history: persistence }),
    _graphName: 'detached-runtime',
    _writerId: 'agent-1',
    _gcPolicy: GCPolicy.DEFAULT,
    _checkpointPolicy: null,
    _logger: null,
    _trustConfig: { mode: 'off', pin: null },
    _onDeleteWithData: 'reject',
    _crypto: defaultCrypto,
    _codec: defaultCodec,
  };
}

function createDetachedReadSurface(): DetachedGraphInternalReadSurface {
  return {
    async materialize() {
      throw new RuntimeSeamTestError('materialize should not be called');
    },
    async materializeCoordinate() {
      throw new RuntimeSeamTestError('materializeCoordinate should not be called');
    },
    async materializeStrand() {
      throw new RuntimeSeamTestError('materializeStrand should not be called');
    },
    async _materializeGraph() {
      throw new RuntimeSeamTestError('_materializeGraph should not be called');
    },
    async _materializeCoordinateGraph() {
      throw new RuntimeSeamTestError('_materializeCoordinateGraph should not be called');
    },
    async _materializeStrandGraph() {
      throw new RuntimeSeamTestError('_materializeStrandGraph should not be called');
    },
  };
}

function requireDetachedOpenOptions(
  open: ReturnType<typeof vi.fn<DetachedGraphOpen>>
): DetachedOpenOptions {
  expect(open).toHaveBeenCalledTimes(1);
  const call = open.mock.calls[0];
  if (call === undefined) {
    throw new RuntimeSeamTestError('detached opener was not called');
  }
  return call[0];
}

class RuntimeSeamTestError extends Error {}

function requireSinglePatchSha(patches: ReadonlyArray<{ readonly sha: string }>): string {
  const patch = patches[0];
  if (patch === undefined) {
    throw new RuntimeSeamTestError('expected one strand patch');
  }
  return patch.sha;
}
