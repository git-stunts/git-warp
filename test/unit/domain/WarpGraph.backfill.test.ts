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

/**
 * Creates a mock persistence adapter for testing.
 * @returns {any} Mock persistence adapter
 */
function createMockPersistence(): any {
  const persistence = {
    readRef: vi.fn(),
    showNode: vi.fn(),
    writeBlob: vi.fn(),
    writeTree: vi.fn(),
    readBlob: vi.fn(),
    readTreeOids: vi.fn(),
    commitNode: vi.fn(),
    commitNodeWithTree: vi.fn(),
    updateRef: vi.fn(),
    listRefs: vi.fn().mockResolvedValue([]),
    getNodeInfo: vi.fn(),
    ping: vi.fn().mockResolvedValue({ ok: true, latencyMs: 1 }),
    configGet: vi.fn().mockResolvedValue(null),
    configSet: vi.fn().mockResolvedValue(undefined),
    compareAndSwapRef: vi.fn(),
  };
  persistence.compareAndSwapRef.mockImplementation(async (ref, newOid, expectedOid) => {
    const actualOid = await persistence.readRef(ref);
    if (actualOid !== expectedOid) {
      throw new Error(`CAS mismatch for ${ref}`);
    }
    persistence.readRef.mockResolvedValue(newOid);
  });
  return persistence;
}

/**
 * Creates a mock patch commit structure for testing.
 * @param {object} options
 * @param {string} options.sha - The commit SHA
 * @param {string} options.graphName - The graph name
 * @param {string} options.writerId - The writer ID
 * @param {number} options.lamport - The lamport timestamp
 * @param {string} options.patchOid - The patch blob OID
 * @param {any[]} options.ops - The operations in the patch (schema:2 format with dots)
 * @param {string|null} [options.parentSha] - The parent commit SHA
 * @param {any} [options.context] - The context VV for schema:2 patches
 * @returns {any} Mock patch data for testing
 */
function createMockPatch({ sha, graphName, writerId, lamport, patchOid, ops, parentSha = null, context = null }: { sha: string; graphName: string; writerId: string; lamport: number; patchOid: string; ops: any[]; parentSha?: string | null; context?: any }) {
  const patch = {
    schema: 2,
    writer: writerId,
    lamport,
    context: context || { [writerId]: lamport },
    ops,
  };
  const patchBuffer = encode(patch);
  const message = encodePatchMessage({
    graph: graphName,
    writer: writerId,
    lamport,
    patchOid,
    schema: 2,
  });

  return {
    sha,
    patchOid,
    patchBuffer,
    message,
    parentSha,
    nodeInfo: {
      sha,
      message,
      author: 'Test <test@example.com>',
      date: new Date().toISOString(),
      parents: parentSha ? [parentSha] : [],
    },
  };
}

describe('WarpCore', () => {
  describe('backfill rejection and divergence detection', () => {
    describe('_isAncestor', () => {
      it('returns true when ancestorSha equals descendantSha', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        } as any);

        const sha = 'a'.repeat(40);
        const result = await (graph)._isAncestor(sha, sha);

        expect(result).toBe(true);
      });

      it('returns true when ancestorSha is parent of descendantSha', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        } as any);

        const ancestorSha = 'a'.repeat(40);
        const descendantSha = 'b'.repeat(40);

        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: descendantSha,
          parents: [ancestorSha],
        });

        const result = await (graph)._isAncestor(ancestorSha, descendantSha);

        expect(result).toBe(true);
      });

      it('returns true for multi-hop ancestor relationship', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        } as any);

        const ancestorSha = 'a'.repeat(40);
        const middleSha = 'b'.repeat(40);
        const descendantSha = 'c'.repeat(40);

        persistence.getNodeInfo
          .mockResolvedValueOnce({ sha: descendantSha, parents: [middleSha] })
          .mockResolvedValueOnce({ sha: middleSha, parents: [ancestorSha] });

        const result = await (graph)._isAncestor(ancestorSha, descendantSha);

        expect(result).toBe(true);
      });

      it('returns false when not an ancestor', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        } as any);

        const sha1 = 'a'.repeat(40);
        const sha2 = 'b'.repeat(40);

        // sha2 has no parents - end of chain
        persistence.getNodeInfo.mockResolvedValue({
          sha: sha2,
          parents: [],
        });

        const result = await (graph)._isAncestor(sha1, sha2);

        expect(result).toBe(false);
      });

      it('returns false for null inputs', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        } as any);

        expect(await (graph as any)._isAncestor(null, 'a'.repeat(40))).toBe(false);
        expect(await (graph as any)._isAncestor('a'.repeat(40), null)).toBe(false);
        expect(await (graph as any)._isAncestor(null, null)).toBe(false);
      });
    });

    describe('_relationToCheckpointHead', () => {
      it('returns "same" when shas are equal', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        } as any);

        const sha = 'a'.repeat(40);
        const result = await (graph)._relationToCheckpointHead(sha, sha);

        expect(result).toBe('same');
      });

      it('returns "ahead" when incoming extends checkpoint head', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        } as any);

        const ckHead = 'a'.repeat(40);
        const incomingSha = 'b'.repeat(40);

        // incoming has ckHead as parent (incoming is ahead)
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: incomingSha,
          parents: [ckHead],
        });

        const result = await (graph)._relationToCheckpointHead(ckHead, incomingSha);

        expect(result).toBe('ahead');
      });

      it('returns "behind" when incoming is ancestor of checkpoint head', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        } as any);

        const incomingSha = 'a'.repeat(40);
        const ckHead = 'b'.repeat(40);

        // First call for _isAncestor(ckHead, incomingSha) - false
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: incomingSha,
          parents: [],
        });
        // Second call for _isAncestor(incomingSha, ckHead) - true
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: ckHead,
          parents: [incomingSha],
        });

        const result = await (graph)._relationToCheckpointHead(ckHead, incomingSha);

        expect(result).toBe('behind');
      });

      it('returns "diverged" when neither is ancestor of the other', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        } as any);

        const ckHead = 'a'.repeat(40);
        const incomingSha = 'b'.repeat(40);
        const commonAncestor = 'c'.repeat(40);

        // First call for _isAncestor(ckHead, incomingSha) - walks to commonAncestor
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: incomingSha,
          parents: [commonAncestor],
        });
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: commonAncestor,
          parents: [],
        });
        // Second call for _isAncestor(incomingSha, ckHead) - walks to commonAncestor
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: ckHead,
          parents: [commonAncestor],
        });
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: commonAncestor,
          parents: [],
        });

        const result = await (graph)._relationToCheckpointHead(ckHead, incomingSha);

        expect(result).toBe('diverged');
      });
    });

    describe('_validatePatchAgainstCheckpoint', () => {
      it('does not throw for schema:1 checkpoint', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        } as any);

        const checkpoint = { schema: 1, frontier: new Map() };

        // Should not throw
        await expect(
          (graph)._validatePatchAgainstCheckpoint('writer-1', 'a'.repeat(40), checkpoint)
        ).resolves.toBeUndefined();
      });

      it('does not throw when writer not in checkpoint frontier', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        } as any);

        const checkpoint = {
          schema: 5,
          frontier: new Map([['other-writer', 'b'.repeat(40)]]),
        };

        // writer-1 not in checkpoint - should succeed
        await expect(
          (graph)._validatePatchAgainstCheckpoint('writer-1', 'a'.repeat(40), checkpoint)
        ).resolves.toBeUndefined();
      });

      it('allows patch ahead of checkpoint frontier', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        } as any);

        const ckHead = 'a'.repeat(40);
        const incomingSha = 'b'.repeat(40);

        const checkpoint = {
          schema: 5,
          frontier: new Map([['writer-1', ckHead]]),
        };

        // incoming has ckHead as parent (ahead)
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: incomingSha,
          parents: [ckHead],
        });

        await expect(
          (graph)._validatePatchAgainstCheckpoint('writer-1', incomingSha, checkpoint)
        ).resolves.toBeUndefined();
      });

      it('rejects patch same as checkpoint head', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        } as any);

        const sha = 'a'.repeat(40);

        const checkpoint = {
          schema: 5,
          frontier: new Map([['writer-1', sha]]),
        };

        await expect(
          (graph)._validatePatchAgainstCheckpoint('writer-1', sha, checkpoint)
        ).rejects.toThrow('Backfill rejected for writer writer-1: incoming patch is same checkpoint frontier');
      });

      it('rejects patch behind checkpoint head', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        } as any);

        const incomingSha = 'a'.repeat(40);
        const ckHead = 'b'.repeat(40);

        const checkpoint = {
          schema: 5,
          frontier: new Map([['writer-1', ckHead]]),
        };

        // First call for _isAncestor(ckHead, incomingSha) - false
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: incomingSha,
          parents: [],
        });
        // Second call for _isAncestor(incomingSha, ckHead) - true (incoming is parent of ckHead)
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: ckHead,
          parents: [incomingSha],
        });

        await expect(
          (graph)._validatePatchAgainstCheckpoint('writer-1', incomingSha, checkpoint)
        ).rejects.toThrow('Backfill rejected for writer writer-1: incoming patch is behind checkpoint frontier');
      });

      it('rejects diverged patch (fork) with different error', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        } as any);

        const ckHead = 'a'.repeat(40);
        const incomingSha = 'b'.repeat(40);
        const commonAncestor = 'c'.repeat(40);

        const checkpoint = {
          schema: 5,
          frontier: new Map([['writer-1', ckHead]]),
        };

        // First call for _isAncestor(ckHead, incomingSha) - walks to commonAncestor
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: incomingSha,
          parents: [commonAncestor],
        });
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: commonAncestor,
          parents: [],
        });
        // Second call for _isAncestor(incomingSha, ckHead) - walks to commonAncestor
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: ckHead,
          parents: [commonAncestor],
        });
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: commonAncestor,
          parents: [],
        });

        await expect(
          (graph)._validatePatchAgainstCheckpoint('writer-1', incomingSha, checkpoint)
        ).rejects.toThrow('Writer fork detected for writer-1: incoming patch does not extend checkpoint head');
      });
    });

    describe('_loadPatchesSince', () => {
      it('validates ancestry once per writer tip and aggregates patches', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        } as any);

        const writerIds = ['writer-1', 'writer-2', 'writer-3'];
        vi.spyOn(graph, 'discoverWriters').mockResolvedValue(writerIds);

        const writer1Patches: any[] = [
          { sha: '1'.repeat(40), patch: { schema: 2, writer: 'writer-1', lamport: 1, context: { 'writer-1': 1 }, ops: [] } },
          { sha: '2'.repeat(40), patch: { schema: 2, writer: 'writer-1', lamport: 2, context: { 'writer-1': 2 }, ops: [] } },
        ];
        const writer2Patches: any[] = [
          { sha: '3'.repeat(40), patch: { schema: 2, writer: 'writer-2', lamport: 1, context: { 'writer-2': 1 }, ops: [] } },
        ];
        const writer3Patches: any[] = [];

        const loadWriterPatchesSpy = vi
          .spyOn(graph, ('_loadWriterPatches'))
          .mockResolvedValueOnce(writer1Patches)
          .mockResolvedValueOnce(writer2Patches)
          .mockResolvedValueOnce(writer3Patches);
        const validateSpy = vi
          .spyOn(graph, ('_validatePatchAgainstCheckpoint'))
          .mockResolvedValue(undefined);

        const checkpoint = {
          schema: 2,
          frontier: new Map([
            ['writer-1', 'a'.repeat(40)],
            ['writer-2', 'b'.repeat(40)],
            ['writer-3', 'c'.repeat(40)],
          ]),
          state: createEmptyState(),
          stateHash: 'd'.repeat(64),
        };

        const result = await (graph)._loadPatchesSince(checkpoint);

        expect(loadWriterPatchesSpy).toHaveBeenNthCalledWith(1, 'writer-1', 'a'.repeat(40));
        expect(loadWriterPatchesSpy).toHaveBeenNthCalledWith(2, 'writer-2', 'b'.repeat(40));
        expect(loadWriterPatchesSpy).toHaveBeenNthCalledWith(3, 'writer-3', 'c'.repeat(40));

        // Tip-only ancestry validation: one call per non-empty writer.
        expect(validateSpy).toHaveBeenCalledTimes(2);
        expect(validateSpy).toHaveBeenNthCalledWith(1, 'writer-1', '2'.repeat(40), checkpoint);
        expect(validateSpy).toHaveBeenNthCalledWith(2, 'writer-2', '3'.repeat(40), checkpoint);

        expect(result).toEqual([...writer1Patches, ...writer2Patches]);
      });
    });
  });

});
