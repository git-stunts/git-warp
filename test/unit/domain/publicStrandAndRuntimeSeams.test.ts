import { describe, expect, it, vi } from 'vitest';

import {
  StrandError,
  WarpCore,
  openWarpGraph,
} from '../../../index.ts';
import RuntimeDetachedFactory from '../../../src/domain/warp/RuntimeDetachedFactory.ts';
import RuntimePatchCollector from '../../../src/domain/warp/RuntimePatchCollector.ts';
import {
  openRuntimeHostProduct,
  type RuntimeHostProduct,
} from '../../../src/domain/warp/RuntimeHostProduct.ts';
import InMemoryGraphAdapter from '../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import PatchJournalPort from '../../../src/ports/PatchJournalPort.ts';
import CheckpointStorePort from '../../../src/ports/CheckpointStorePort.ts';
import IndexStorePort from '../../../src/ports/IndexStorePort.ts';

import type { DetachedOpenHost } from '../../../src/domain/services/controllers/detachedOpen.ts';

describe('public strand and runtime host seams', () => {
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
    const core = await WarpCore.open({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'strand-public-surface',
      writerId: 'agent-1',
    });

    const descriptor = await core.createStrand({
      strandId: 'review',
      owner: 'agent-1',
    });
    await core.patchStrand('review', (patch) => {
      patch
        .addNode('task:review')
        .setProperty('task:review', 'status', 'draft');
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
    expect(entityPatches).toEqual([patches[0]?.sha]);
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
    const runtime = await openRuntimeHostProduct({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'detached-runtime',
      writerId: 'agent-1',
    });
    await runtime.patch((patch) => {
      patch.addNode('node:detached');
    });

    const detached = await new RuntimeDetachedFactory(
      createDetachedHost(runtime),
      openRuntimeHostProduct,
    ).openReadOnly();
    const snapshot = await detached.materialize({ ceiling: null });

    expect(snapshot.nodeAlive.contains('node:detached')).toBe(true);
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

function createDetachedHost(runtime: RuntimeHostProduct): DetachedOpenHost {
  return {
    _persistence: runtime.persistence,
    _graphName: runtime.graphName,
    _writerId: runtime.writerId,
    _gcPolicy: runtime.gcPolicy,
    _checkpointPolicy: null,
    _logger: null,
    _seekCache: runtime.seekCache,
    _blobStorage: null,
    _patchBlobStorage: null,
    _trustConfig: { mode: 'off', pin: null },
    _patchJournal: readPatchJournal(runtime),
    _checkpointStore: readCheckpointStore(runtime),
    _indexStore: readIndexStore(runtime),
    _onDeleteWithData: runtime.onDeleteWithData,
    _crypto: runtime._crypto,
    _codec: runtime._codec,
  };
}

function readPatchJournal(runtime: RuntimeHostProduct): PatchJournalPort {
  const value = Reflect.get(runtime, '_patchJournal');
  if (value instanceof PatchJournalPort) {
    return value;
  }
  throw new RuntimeSeamTestError('runtime product did not expose a patch journal');
}

function readCheckpointStore(runtime: RuntimeHostProduct): CheckpointStorePort {
  const value = Reflect.get(runtime, '_checkpointStore');
  if (value instanceof CheckpointStorePort) {
    return value;
  }
  throw new RuntimeSeamTestError('runtime product did not expose a checkpoint store');
}

function readIndexStore(runtime: RuntimeHostProduct): IndexStorePort {
  const value = Reflect.get(runtime, '_indexStore');
  if (value instanceof IndexStorePort) {
    return value;
  }
  throw new RuntimeSeamTestError('runtime product did not expose an index store');
}

class RuntimeSeamTestError extends Error {}
