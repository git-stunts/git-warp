import { describe, it, expect, vi } from 'vitest';
import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import { PatchBuilder } from '../../../src/domain/services/PatchBuilder.ts';
import AuditVerifierService from '../../../src/domain/services/audit/AuditVerifierService.ts';
import { NoOpEffectSink } from '../../../src/infrastructure/adapters/NoOpEffectSink.ts';

import { encode } from '../../../src/infrastructure/codecs/CborCodec.ts';
import { encodePatchMessage, encodeCheckpointMessage } from '../../../src/domain/services/codec/WarpMessageCodec.ts';
import { createEmptyState } from '../../../src/domain/services/JoinReducer.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import WarpStream from '../../../src/domain/stream/WarpStream.ts';
import type { CommitLogChunk } from '../../../src/ports/CommitPort.ts';

const crypto = new NodeCryptoAdapter();

type TestNeighborEdge = {
  readonly neighborId: string;
  readonly label: string;
};

function materializedGraphFor(state = createEmptyState()) {
  return {
    state,
    stateHash: 'test-state-hash',
    adjacency: {
      outgoing: new Map<string, readonly TestNeighborEdge[]>(),
      incoming: new Map<string, readonly TestNeighborEdge[]>(),
    },
  };
}

function installCleanCheckpointReadingBasis(
  graph: { _cachedState: ReturnType<typeof createEmptyState> | null; _stateDirty: boolean },
): void {
  graph._cachedState = createEmptyState();
  graph._stateDirty = false;
}

function createMockPersistence() {
  const persistence = {
    readRef: vi.fn(),
    showNode: vi.fn(),
    writeBlob: vi.fn(),
    writeTree: vi.fn(),
    readBlob: vi.fn(),
    readTree: vi.fn().mockResolvedValue({}),
    readTreeOids: vi.fn(),
    deleteRef: vi.fn().mockResolvedValue(undefined),
    logNodes: vi.fn().mockResolvedValue(''),
    logNodesStream: vi.fn().mockResolvedValue(WarpStream.from<CommitLogChunk>({ [Symbol.asyncIterator]: async function* () { /* empty */ } })),
    countNodes: vi.fn().mockResolvedValue(0),
    nodeExists: vi.fn().mockResolvedValue(true),
    getCommitTree: vi.fn().mockResolvedValue('4b825dc642cb6eb9a060e54bf8d69288fbee4904'),
    commitNode: vi.fn(),
    commitNodeWithTree: vi.fn(),
    updateRef: vi.fn(),
    listRefs: vi.fn().mockResolvedValue([]),
    getNodeInfo: vi.fn(),
    ping: vi.fn().mockResolvedValue({ ok: true, latencyMs: 1 }),
    configGet: vi.fn().mockResolvedValue(null),
    configSet: vi.fn().mockResolvedValue(undefined),
    compareAndSwapRef: vi.fn(),
    emptyTree: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
  };
  persistence.compareAndSwapRef.mockImplementation(async (ref: string, newOid: string, expectedOid: string | null) => {
    const actualOid = await persistence.readRef(ref);
    if (actualOid !== expectedOid) {
      throw new Error(`CAS mismatch for ${ref}`);
    }
    persistence.readRef.mockResolvedValue(newOid);
  });
  return persistence;
}

describe('WarpCore', () => {
  describe('syncCoverage', () => {
    it('creates anchor with correct parents', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      // Mock discoverWriters to return multiple writers
      const writer1Sha = 'a'.repeat(40);
      const writer2Sha = 'b'.repeat(40);
      const anchorSha = 'c'.repeat(40);

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1', 'writer-2']);

      persistence.readRef
        .mockResolvedValueOnce(writer1Sha) // writer-1 ref
        .mockResolvedValueOnce(writer2Sha); // writer-2 ref
      persistence.commitNode.mockResolvedValue(anchorSha);
      persistence.updateRef.mockResolvedValue(undefined);

      await graph.syncCoverage();

      // Verify commitNode was called with both parents
      expect(persistence.commitNode).toHaveBeenCalledWith({
        message: expect.stringContaining('warp:anchor'),
        parents: [writer1Sha, writer2Sha],
      });
    });

    it('updates coverage ref', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      const writerSha = 'a'.repeat(40);
      const anchorSha = 'c'.repeat(40);

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1']);

      persistence.readRef.mockResolvedValue(writerSha);
      persistence.commitNode.mockResolvedValue(anchorSha);
      persistence.updateRef.mockResolvedValue(undefined);

      await graph.syncCoverage();

      // Verify updateRef was called with the correct coverage ref
      expect(persistence.updateRef).toHaveBeenCalledWith(
        'refs/warp/events/coverage/head',
        anchorSha
      );
    });

    it('does nothing when no writers exist', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue([]);

      await graph.syncCoverage();

      // Should not call commitNode or updateRef
      expect(persistence.commitNode).not.toHaveBeenCalled();
      expect(persistence.updateRef).not.toHaveBeenCalled();
    });

    it('does nothing when all writer refs return null', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1', 'writer-2']);

      persistence.readRef.mockResolvedValue(null); // All refs return null

      await graph.syncCoverage();

      // Should not call commitNode or updateRef
      expect(persistence.commitNode).not.toHaveBeenCalled();
      expect(persistence.updateRef).not.toHaveBeenCalled();
    });

    it('only includes writers with existing refs as parents', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      const writerSha = 'a'.repeat(40);
      const anchorSha = 'c'.repeat(40);

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1', 'writer-2']);

      persistence.readRef
        .mockResolvedValueOnce(writerSha) // writer-1 has a ref
        .mockResolvedValueOnce(null);      // writer-2 does not
      persistence.commitNode.mockResolvedValue(anchorSha);
      persistence.updateRef.mockResolvedValue(undefined);

      await graph.syncCoverage();

      // Verify commitNode was called with only writer-1's SHA
      expect(persistence.commitNode).toHaveBeenCalledWith({
        message: expect.stringContaining('warp:anchor'),
        parents: [writerSha],
      });
    });
  });

  describe('createCheckpoint', () => {
    it('creates valid checkpoint', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        crypto,
      });

      const writerSha = 'a'.repeat(40);
      const checkpointSha = 'c'.repeat(40);
      const blobOid = 'd'.repeat(40);
      const treeOid = 'e'.repeat(40);

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1']);
      installCleanCheckpointReadingBasis(graph);

      persistence.readRef.mockResolvedValue(writerSha);
      persistence.writeBlob.mockResolvedValue(blobOid);
      persistence.writeTree.mockResolvedValue(treeOid);
      persistence.commitNodeWithTree.mockResolvedValue(checkpointSha);
      persistence.updateRef.mockResolvedValue(undefined);

      const sha = await graph.createCheckpoint();

      expect(sha).toBe(checkpointSha);
      // Verify commitNodeWithTree was called with correct parents
      expect(persistence.commitNodeWithTree).toHaveBeenCalledWith(
        expect.objectContaining({
          parents: [writerSha],
          message: expect.stringContaining('warp:checkpoint'),
        })
      );
    });

    it('updates checkpoint ref', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        crypto,
      });

      const writerSha = 'a'.repeat(40);
      const checkpointSha = 'c'.repeat(40);
      const blobOid = 'd'.repeat(40);
      const treeOid = 'e'.repeat(40);

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1']);
      installCleanCheckpointReadingBasis(graph);

      persistence.readRef.mockResolvedValue(writerSha);
      persistence.writeBlob.mockResolvedValue(blobOid);
      persistence.writeTree.mockResolvedValue(treeOid);
      persistence.commitNodeWithTree.mockResolvedValue(checkpointSha);
      persistence.updateRef.mockResolvedValue(undefined);

      await graph.createCheckpoint();

      // Verify updateRef was called with the correct checkpoint ref
      expect(persistence.updateRef).toHaveBeenCalledWith(
        'refs/warp/events/checkpoints/head',
        checkpointSha
      );
    });

    it('returns checkpoint SHA', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        crypto,
      });

      const writerSha = 'a'.repeat(40);
      const checkpointSha = 'f'.repeat(40);
      const blobOid = 'd'.repeat(40);
      const treeOid = 'e'.repeat(40);

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1']);
      installCleanCheckpointReadingBasis(graph);

      persistence.readRef.mockResolvedValue(writerSha);
      persistence.writeBlob.mockResolvedValue(blobOid);
      persistence.writeTree.mockResolvedValue(treeOid);
      persistence.commitNodeWithTree.mockResolvedValue(checkpointSha);
      persistence.updateRef.mockResolvedValue(undefined);

      const sha = await graph.createCheckpoint();

      expect(sha).toBe(checkpointSha);
    });

    it('builds frontier from all writer tips', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        crypto,
      });

      const writer1Sha = 'a'.repeat(40);
      const writer2Sha = 'b'.repeat(40);
      const checkpointSha = 'c'.repeat(40);
      const blobOid = 'd'.repeat(40);
      const treeOid = 'e'.repeat(40);

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1', 'writer-2']);
      installCleanCheckpointReadingBasis(graph);

      persistence.readRef
        .mockResolvedValueOnce(writer1Sha)
        .mockResolvedValueOnce(writer2Sha);
      persistence.writeBlob.mockResolvedValue(blobOid);
      persistence.writeTree.mockResolvedValue(treeOid);
      persistence.commitNodeWithTree.mockResolvedValue(checkpointSha);
      persistence.updateRef.mockResolvedValue(undefined);

      await graph.createCheckpoint();

      // Verify checkpoint was created with both parents
      expect(persistence.commitNodeWithTree).toHaveBeenCalledWith(
        expect.objectContaining({
          parents: [writer1Sha, writer2Sha],
        })
      );
    });

    it('creates checkpoint with empty frontier when no writers have refs', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        crypto,
      });

      const checkpointSha = 'c'.repeat(40);
      const blobOid = 'd'.repeat(40);
      const treeOid = 'e'.repeat(40);

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1']);
      installCleanCheckpointReadingBasis(graph);

      persistence.readRef.mockResolvedValue(null); // No refs exist
      persistence.writeBlob.mockResolvedValue(blobOid);
      persistence.writeTree.mockResolvedValue(treeOid);
      persistence.commitNodeWithTree.mockResolvedValue(checkpointSha);
      persistence.updateRef.mockResolvedValue(undefined);

      const sha = await graph.createCheckpoint();

      expect(sha).toBe(checkpointSha);
      // Verify checkpoint was created with empty parents
      expect(persistence.commitNodeWithTree).toHaveBeenCalledWith(
        expect.objectContaining({
          parents: [],
        })
      );
    });

    it('falls back to checkpoint without index when index build fails', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        crypto,
      });

      const writerSha = 'a'.repeat(40);
      const checkpointSha = 'f'.repeat(40);
      const blobOid = 'd'.repeat(40);
      const treeOid = 'e'.repeat(40);
      const warn = vi.fn();

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1']);
      installCleanCheckpointReadingBasis(graph);

      persistence.readRef.mockResolvedValue(writerSha);
      persistence.writeBlob.mockResolvedValue(blobOid);
      persistence.writeTree.mockResolvedValue(treeOid);
      persistence.commitNodeWithTree.mockResolvedValue(checkpointSha);
      persistence.updateRef.mockResolvedValue(undefined);

      Reflect.set(graph, '_cachedIndexTree', null);
      Reflect.set(graph, '_logger', { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() });
      Reflect.set(graph, '_viewService', {
        build: vi.fn(() => {
          throw new Error('roaring unavailable');
        }),
      });

      const sha = await graph.createCheckpoint();

      expect(sha).toBe(checkpointSha);
      expect(warn).toHaveBeenCalledWith(
        '[warp] checkpoint index build failed; saving checkpoint without index',
        expect.objectContaining({ error: 'roaring unavailable' }),
      );
      expect(persistence.commitNodeWithTree).toHaveBeenCalled();
    });
  });

  describe('schema version selection (WARP v5)', () => {
    describe('createPatch with schema selection', () => {
      it('schema 2 (default) uses PatchBuilder', async () => {
        const persistence = createMockPersistence();
        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
        });

        const patchBuilder = await graph.createPatch();

        expect(patchBuilder).toBeInstanceOf(PatchBuilder);
      });

      it('schema 2 (explicit) uses PatchBuilder', async () => {
        const persistence = createMockPersistence();
        // No writers, no checkpoint - fresh graph
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        } as Parameters<typeof openRuntimeHostProduct>[0]);

        const patchBuilder = await graph.createPatch();

        expect(patchBuilder).toBeInstanceOf(PatchBuilder);
      });
    });

    describe('migration boundary validation', () => {
      it('rejects schema:2 checkpoint with upgrade guidance', async () => {
        const persistence = createMockPersistence();

        const checkpointSha = 'c'.repeat(40);
        const indexOid = 'd'.repeat(40);

        // Checkpoint with schema:2 exists
        const checkpointMessage = encodeCheckpointMessage({
          graph: 'events',
          stateHash: 'e'.repeat(64),
          frontierOid: 'f'.repeat(40),
          indexOid,
          schema: 2,
        });

        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockImplementation((ref: string) => {
          if (ref === 'refs/warp/events/checkpoints/head') {
            return Promise.resolve(checkpointSha);
          }
          return Promise.resolve(null);
        });
        persistence.showNode.mockResolvedValue(checkpointMessage);
        persistence.getNodeInfo.mockResolvedValue({
          sha: checkpointSha,
          message: checkpointMessage,
          parents: [],
        });

        await expect(
          openRuntimeHostProduct({
            persistence,
            graphName: 'events',
            writerId: 'node-1',
            schema: 2,
          } as Parameters<typeof openRuntimeHostProduct>[0])
        ).rejects.toMatchObject({ code: 'E_CHECKPOINT_UNSUPPORTED_SCHEMA' });
        expect(persistence.readTreeOids).not.toHaveBeenCalled();
      });

      it('allows schema:2 on fresh graph with no history', async () => {
        const persistence = createMockPersistence();

        // No writers, no checkpoint
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        } as Parameters<typeof openRuntimeHostProduct>[0]);

        expect(graph.graphName).toBe('events');
      });
    });
  });

});
