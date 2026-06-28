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
} from '../../../src/domain/warp/RuntimeHostProduct.ts';
import InMemoryGraphAdapter from '../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import PatchJournalPort from '../../../src/ports/PatchJournalPort.ts';
import CheckpointStorePort from '../../../src/ports/CheckpointStorePort.ts';
import IndexStorePort from '../../../src/ports/IndexStorePort.ts';
import defaultCrypto from '../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import GCPolicy from '../../../src/domain/services/GCPolicy.ts';
import WarpStream from '../../../src/domain/stream/WarpStream.ts';

import type {
  DetachedGraphOpen,
  DetachedOpenHost,
  DetachedOpenOptions,
} from '../../../src/domain/services/controllers/detachedOpen.ts';
import type { DetachedGraphInternalReadSurface } from '../../../src/domain/capabilities/DetachedGraphFactory.ts';
import type Patch from '../../../src/domain/types/Patch.ts';
import type PatchEntry from '../../../src/domain/artifacts/PatchEntry.ts';
import type {
  CheckpointData,
  CheckpointRecord,
  CheckpointWriteResult,
} from '../../../src/ports/CheckpointStorePort.ts';
import type { IndexShard } from '../../../src/domain/artifacts/IndexShard.ts';
import type CodecValue from '../../../src/domain/types/codec/CodecValue.ts';

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
      graphName: 'detached-runtime',
      writerId: 'agent-1',
      gcPolicy: GCPolicy.DEFAULT,
      autoMaterialize: false,
      onDeleteWithData: 'reject',
      crypto: defaultCrypto,
      codec: defaultCodec,
      audit: false,
    });
    expect(options.seekCache).toBeUndefined();
    expect(options.blobStorage).toBeUndefined();
    expect(options.patchBlobStorage).toBeUndefined();
    expect(options.trust).toEqual({ mode: 'off', pin: null });
    expect(options.patchJournal).toBe(host._patchJournal);
    expect(options.checkpointStore).toBe(host._checkpointStore);
    expect(options.indexStore).toBe(host._indexStore);
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
  return {
    _persistence: new InMemoryGraphAdapter(),
    _graphName: 'detached-runtime',
    _writerId: 'agent-1',
    _gcPolicy: GCPolicy.DEFAULT,
    _checkpointPolicy: null,
    _logger: null,
    _seekCache: null,
    _blobStorage: null,
    _patchBlobStorage: null,
    _trustConfig: { mode: 'off', pin: null },
    _patchJournal: new RecordingPatchJournalPort(),
    _checkpointStore: new RecordingCheckpointStorePort(),
    _indexStore: new RecordingIndexStorePort(),
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
  open: ReturnType<typeof vi.fn<DetachedGraphOpen>>,
): DetachedOpenOptions {
  expect(open).toHaveBeenCalledTimes(1);
  const call = open.mock.calls[0];
  if (call === undefined) {
    throw new RuntimeSeamTestError('detached opener was not called');
  }
  return call[0];
}

class RecordingPatchJournalPort extends PatchJournalPort {
  async writePatch(_patch: Patch): Promise<string> {
    return 'patch-oid';
  }

  async readPatch(_patchOid: string): Promise<Patch> {
    throw new RuntimeSeamTestError('readPatch should not be called');
  }

  scanPatchRange(
    _writerId: string,
    _fromSha: string | null,
    _toSha: string,
  ): WarpStream<PatchEntry> {
    return WarpStream.from([]);
  }
}

class RecordingCheckpointStorePort extends CheckpointStorePort {
  async writeCheckpoint(_record: CheckpointRecord): Promise<CheckpointWriteResult> {
    return {
      stateBlobOid: 'state-oid',
      frontierBlobOid: 'frontier-oid',
      appliedVVBlobOid: 'applied-vv-oid',
      provenanceIndexBlobOid: null,
    };
  }

  async readCheckpoint(_treeOids: Record<string, string>): Promise<CheckpointData> {
    throw new RuntimeSeamTestError('readCheckpoint should not be called');
  }
}

class RecordingIndexStorePort extends IndexStorePort {
  async writeShards(_shardStream: WarpStream<IndexShard>): Promise<string> {
    return 'index-tree-oid';
  }

  scanShards(_treeOid: string): WarpStream<IndexShard> {
    return WarpStream.from([]);
  }

  async readShardOids(_treeOid: string): Promise<Record<string, string>> {
    return {};
  }

  async decodeShard<TDecoded extends CodecValue = CodecValue>(
    _blobOid: string,
  ): Promise<TDecoded> {
    throw new RuntimeSeamTestError('decodeShard should not be called');
  }
}

class RuntimeSeamTestError extends Error {}

function requireSinglePatchSha(
  patches: ReadonlyArray<{ readonly sha: string }>,
): string {
  const patch = patches[0];
  if (patch === undefined) {
    throw new RuntimeSeamTestError('expected one strand patch');
  }
  return patch.sha;
}
