import { describe, it, expect, vi } from 'vitest';
import { openMemoryRuntimeHostProduct as openRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';
import { PatchBuilder } from '../../../src/domain/services/PatchBuilder.ts';
import AuditVerifierService from '../../../src/domain/services/audit/AuditVerifierService.ts';
import { NoOpEffectSink } from '../../../src/infrastructure/adapters/NoOpEffectSink.ts';

import { encode } from '../../../src/infrastructure/codecs/CborCodec.ts';
import { encodePatchMessage, encodeCheckpointMessage } from '../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { createEmptyState } from '../../../src/domain/services/JoinReducer.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import WarpStream from '../../../src/domain/stream/WarpStream.ts';
import type { CommitLogChunk } from '../../../src/ports/CommitPort.ts';
import InMemoryGraphAdapter from '../../helpers/InMemoryGraphAdapter.ts';

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
  describe('version vector correctness (Task 3)', () => {
    describe('VV updates after materialize', () => {
      it('updates _versionVector to match state.observedFrontier', async () => {
        const persistence = createMockPersistence();
        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        } as Parameters<typeof openRuntimeHostProduct>[0]);

        // Before materialize, VV should be empty
        expect((graph)._versionVector.size).toBe(0);

        // Create patches with context VVs that will merge into observedFrontier
        const patchOidA = 'a'.repeat(40);
        const commitShaA = 'b'.repeat(40);
        const patchOidB = 'c'.repeat(40);
        const commitShaB = 'd'.repeat(40);

        // Patch from writer-a with context {writer-a: 3}
        const patchA = {
          schema: 2,
          writer: 'writer-a',
          lamport: 3,
          context: { 'writer-a': 3 },
          ops: [{ type: 'NodeAdd', node: 'user:alice', dot: Dot.create('writer-a', 3) }],
        };
        const patchBufferA = encode(patchA);
        const messageA = encodePatchMessage({
          graph: 'events',
          writer: 'writer-a',
          lamport: 3,
          patchOid: patchOidA,
          schema: 2,
        });

        // Patch from writer-b with context {writer-b: 2}
        const patchB = {
          schema: 2,
          writer: 'writer-b',
          lamport: 2,
          context: { 'writer-b': 2 },
          ops: [{ type: 'NodeAdd', node: 'user:bob', dot: Dot.create('writer-b', 2) }],
        };
        const patchBufferB = encode(patchB);
        const messageB = encodePatchMessage({
          graph: 'events',
          writer: 'writer-b',
          lamport: 2,
          patchOid: patchOidB,
          schema: 2,
        });

        persistence.listRefs.mockResolvedValue([
          'refs/warp/events/writers/writer-a',
          'refs/warp/events/writers/writer-b',
        ]);

        persistence.readRef
          .mockResolvedValueOnce(null) // checkpoint ref (none)
          .mockResolvedValueOnce(commitShaA) // writer-a tip
          .mockResolvedValueOnce(commitShaB); // writer-b tip

        persistence.getNodeInfo
          .mockResolvedValueOnce({
            sha: commitShaA,
            message: messageA,
            parents: [],
          })
          .mockResolvedValueOnce({
            sha: commitShaB,
            message: messageB,
            parents: [],
          });

        persistence.readBlob
          .mockResolvedValueOnce(patchBufferA)
          .mockResolvedValueOnce(patchBufferB);

        await graph.materialize();

        // After materialize, VV should reflect merged observedFrontier: {writer-a: 3, writer-b: 2}
        expect((graph)._versionVector.get('writer-a')).toBe(3);
        expect((graph)._versionVector.get('writer-b')).toBe(2);
      });

      it('VV is empty for empty graph', async () => {
        const persistence = createMockPersistence();
        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        } as Parameters<typeof openRuntimeHostProduct>[0]);

        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        await graph.materialize();

        expect((graph)._versionVector.size).toBe(0);
      });
    });

    describe('VV updates after commit', () => {
      it('increments local writer counter in VV after successful commit', async () => {
        const persistence = createMockPersistence();
        persistence.readRef.mockResolvedValue(null); // No existing commits

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'writer-1',
          schema: 2,
        } as Parameters<typeof openRuntimeHostProduct>[0]);

        // VV starts empty
        expect((graph)._versionVector.get('writer-1')).toBeUndefined();

        // Setup mocks for commit
        persistence.writeBlob.mockResolvedValue('a'.repeat(40));
        persistence.writeTree.mockResolvedValue('b'.repeat(40));
        persistence.commitNodeWithTree.mockResolvedValue('c'.repeat(40));
        persistence.updateRef.mockResolvedValue(undefined);

        const builder = await graph.createPatch();
        builder.addNode('user:alice');
        await builder.commit();

        // After commit, VV should have writer-1: 1
        expect((graph)._versionVector.get('writer-1')).toBe(1);
      });

      it('increments only local writer counter, not others', async () => {
        const persistence = createMockPersistence();

        // Setup: VV starts with other writers' counters from materialize
        const patchOid = 'a'.repeat(40);
        const commitSha = 'b'.repeat(40);

        const patchFromOther = {
          schema: 2,
          writer: 'writer-other',
          lamport: 5,
          context: { 'writer-other': 5 },
          ops: [{ type: 'NodeAdd', node: 'user:bob', dot: Dot.create('writer-other', 5) }],
        };
        const patchBuffer = encode(patchFromOther);
        const message = encodePatchMessage({
          graph: 'events',
          writer: 'writer-other',
          lamport: 5,
          patchOid,
          schema: 2,
        });

        persistence.listRefs.mockResolvedValue([
          'refs/warp/events/writers/writer-other',
        ]);
        persistence.readRef.mockImplementation((ref: string) => {
          if (ref.includes('checkpoints')) return Promise.resolve(null);
          if (ref.includes('writer-other')) return Promise.resolve(commitSha);
          if (ref.includes('writer-1')) return Promise.resolve(null);
          return Promise.resolve(null);
        });
        persistence.getNodeInfo.mockResolvedValue({
          sha: commitSha,
          message,
          parents: [],
        });
        persistence.readBlob.mockResolvedValue(patchBuffer);

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'writer-1',
          schema: 2,
        } as Parameters<typeof openRuntimeHostProduct>[0]);

        await graph.materialize();

        // VV should have writer-other: 5
        expect((graph)._versionVector.get('writer-other')).toBe(5);
        expect((graph)._versionVector.get('writer-1')).toBeUndefined();

        // Setup mocks for commit
        persistence.writeBlob.mockResolvedValue('c'.repeat(40));
        persistence.writeTree.mockResolvedValue('d'.repeat(40));
        persistence.commitNodeWithTree.mockResolvedValue('e'.repeat(40));
        persistence.updateRef.mockResolvedValue(undefined);

        const builder = await graph.createPatch();
        builder.addNode('user:alice');
        await builder.commit();

        // After commit: writer-1 has lamport 6 (max(0, maxObserved=5) + 1),
        // and observedFrontier (→ _versionVector) reflects the actual tick.
        // writer-other should still be 5.
        expect((graph)._versionVector.get('writer-1')).toBe(6);
        expect((graph)._versionVector.get('writer-other')).toBe(5);
      });
    });

    describe('race detection', () => {
      it('detects concurrent commit and throws error', async () => {
        const persistence = createMockPersistence();

        // First, no existing ref
        persistence.readRef.mockResolvedValueOnce(null); // During open() checkpoint check
        persistence.listRefs.mockResolvedValue([]);

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'writer-1',
          schema: 2,
        } as Parameters<typeof openRuntimeHostProduct>[0]);

        // createPatch reads ref (returns null - first commit)
        persistence.readRef.mockResolvedValueOnce(null);

        const builder1 = await graph.createPatch();
        builder1.addNode('user:alice');

        // Before builder1 commits, another commit happens
        // Simulate by making the ref return a different SHA when builder1 tries to commit
        const concurrentCommitSha = 'x'.repeat(40);
        persistence.readRef.mockResolvedValueOnce(concurrentCommitSha);

        await expect(builder1.commit()).rejects.toThrow(
          /Commit failed: writer ref was updated by another process/
        );
      });

      it('first builder commits OK, second builder fails with race detection', async () => {
        const persistence = new InMemoryGraphAdapter();

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'writer-1',
          schema: 2,
        } as Parameters<typeof openRuntimeHostProduct>[0]);

        // Both builders capture the same empty writer frontier.
        const builder1 = await graph.createPatch();
        builder1.addNode('user:alice');

        const builder2 = await graph.createPatch();
        builder2.addNode('user:bob');

        // The first publication advances the real in-memory ref atomically.
        const sha1 = await builder1.commit();
        expect(sha1).toMatch(/^[0-9a-f]{40}$/u);

        // The second builder still carries the old expected head and must fail.
        await expect(builder2.commit()).rejects.toThrow(
          /Commit failed: writer ref was updated by another process.*Re-materialize and retry/
        );
      });

      it('allows commit when ref matches expected parent', async () => {
        const persistence = createMockPersistence();
        const existingSha = 'd'.repeat(40);
        const existingPatchOid = 'e'.repeat(40);

        persistence.readRef.mockImplementation((ref: string) => {
          if (ref.includes('checkpoints')) return Promise.resolve(null);
          if (ref.includes('writers')) return Promise.resolve(existingSha);
          return Promise.resolve(null);
        });
        persistence.listRefs.mockResolvedValue([]);
        persistence.showNode.mockResolvedValue(
          `warp:patch\n\neg-kind: patch\neg-graph: events\neg-writer: writer-1\neg-lamport: 5\neg-patch-oid: ${existingPatchOid}\neg-schema: 2`
        );

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'writer-1',
          schema: 2,
        } as Parameters<typeof openRuntimeHostProduct>[0]);

        const builder = await graph.createPatch();
        builder.addNode('user:alice');

        // Setup mocks for commit - ref still matches
        persistence.writeBlob.mockResolvedValue('a'.repeat(40));
        persistence.writeTree.mockResolvedValue('b'.repeat(40));
        persistence.commitNodeWithTree.mockResolvedValue('c'.repeat(40));
        persistence.updateRef.mockResolvedValue(undefined);

        // Should succeed because ref hasn't changed
        const sha = await builder.commit();
        expect(sha).toBe('c'.repeat(40));
      });
    });
  });

  describe('writer factory methods', () => {
    describe('writer()', () => {
      it('uses explicit writerId when provided', async () => {
        const persistence = createMockPersistence();
        persistence.configGet = vi.fn();
        persistence.configSet = vi.fn();

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
        });

        const writer = await graph.writer('alice');

        expect(writer.writerId).toBe('alice');
        expect(writer.graphName).toBe('events');
        // configGet should not be called when explicit ID provided
        expect(persistence.configGet).not.toHaveBeenCalled();
        expect(persistence.configSet).not.toHaveBeenCalled();
      });

      it('resolves writerId from git config when not provided', async () => {
        const persistence = createMockPersistence();
        persistence.configGet = vi.fn().mockResolvedValue('stored-writer');
        persistence.configSet = vi.fn();

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
        });

        const writer = await graph.writer();

        expect(writer.writerId).toBe('stored-writer');
        expect(persistence.configGet).toHaveBeenCalledWith('warp.writerId.events');
        expect(persistence.configSet).not.toHaveBeenCalled();
      });

      it('generates and persists new canonical ID when config is empty', async () => {
        const persistence = createMockPersistence();
        persistence.configGet = vi.fn().mockResolvedValue(null);
        persistence.configSet = vi.fn();

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'my-graph',
          writerId: 'node-1',
        });

        const writer = await graph.writer();

        // Should generate canonical ID
        expect(writer.writerId).toMatch(/^w_[0-9a-hjkmnp-tv-z]{26}$/);
        // Should persist to config
        expect(persistence.configSet).toHaveBeenCalledWith(
          'warp.writerId.my-graph',
          writer.writerId
        );
      });

      it('validates explicit writerId for ref-safety', async () => {
        const persistence = createMockPersistence();
        persistence.configGet = vi.fn();
        persistence.configSet = vi.fn();

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
        });

        // Contains slash - invalid for ref-safety
        await expect(graph.writer('a/b')).rejects.toThrow('Invalid writer ID');
      });

      it('returns Writer instance with correct dependencies', async () => {
        const persistence = createMockPersistence();
        persistence.configGet = vi.fn().mockResolvedValue('test-writer');
        persistence.configSet = vi.fn();

        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
        });

        const writer = await graph.writer();

        // Verify the writer has access to persistence (via head() call)
        persistence.readRef.mockResolvedValue('a'.repeat(40));
        const head = await writer.head();
        expect(head).toBe('a'.repeat(40));
        expect(persistence.readRef).toHaveBeenCalledWith('refs/warp/events/writers/test-writer');
      });
    });

  });

  // ===========================================================================
  // patch() convenience wrapper
  // ===========================================================================
  describe('patch()', () => {
    async function openGraphWithCommitMocks() {
      const persistence = createMockPersistence();
      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob.mockResolvedValue('b'.repeat(40));
      persistence.writeTree.mockResolvedValue('b'.repeat(40));
      persistence.commitNodeWithTree.mockResolvedValue('c'.repeat(40));
      persistence.updateRef.mockResolvedValue(undefined);

      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'patch-test',
        writerId: 'w1',
      });
      return { graph, persistence };
    }

    it('commits with a sync callback and returns SHA', async () => {
      const { graph } = await openGraphWithCommitMocks();

      const sha = await graph.patch(p => {
        p.addNode('n:1');
      });

      expect(typeof sha).toBe('string');
      expect(sha).toHaveLength(40);
    });

    it('commits with an async callback', async () => {
      const { graph } = await openGraphWithCommitMocks();

      const sha = await graph.patch(async p => {
        await Promise.resolve();
        p.addNode('n:2');
      });

      expect(typeof sha).toBe('string');
      expect(sha).toHaveLength(40);
    });

    it('rejects with empty patch error when callback adds nothing', async () => {
      const { graph } = await openGraphWithCommitMocks();

      await expect(graph.patch(() => {})).rejects.toThrow(/empty/i);
    });

    it('propagates callback errors without committing', async () => {
      const { graph, persistence } = await openGraphWithCommitMocks();
      const boom = new Error('user error');

      await expect(graph.patch(() => { throw boom; })).rejects.toThrow(boom);
      expect(persistence.commitNodeWithTree).not.toHaveBeenCalled();
    });

    it('supports chained operations in a single patch', async () => {
      const { graph, persistence } = await openGraphWithCommitMocks();

      const sha = await graph.patch(p => {
        p.addNode('user:alice')
          .setProperty('user:alice', 'name', 'Alice')
          .addNode('user:bob')
          .addEdge('user:alice', 'user:bob', 'follows');
      });

      expect(sha).toHaveLength(40);
      expect(persistence.commitNodeWithTree).toHaveBeenCalledTimes(1);
    });

    it('returns a 40-hex-char commit SHA', async () => {
      const { graph } = await openGraphWithCommitMocks();

      const sha = await graph.patch(p => {
        p.addNode('x');
      });

      expect(sha).toMatch(/^[0-9a-f]{40}$/);
    });

    it('commit occurs exactly once even when builder is captured externally', async () => {
      const { graph, persistence } = await openGraphWithCommitMocks();
      let captured;

      await graph.patch(p => {
        p.addNode('early');
        captured = p;
      });

      // patch() already committed — verify exactly one commit happened
      expect(persistence.commitNodeWithTree).toHaveBeenCalledTimes(1);
      // The captured builder still exists but its commit already fired
      expect(captured).toBeDefined();
    });

    it('rejects nested patch() calls with reentrancy guard', async () => {
      const { graph } = await openGraphWithCommitMocks();

      await expect(graph.patch(async p => {
        p.addNode('outer');
        await graph.patch(inner => {
          inner.addNode('inner');
        });
      })).rejects.toThrow(/not reentrant|nested/i);
    });

    it('round-trips setEdgeProperty via createPatch', async () => {
      const { graph, persistence } = await openGraphWithCommitMocks();

      const sha = await graph.patch(p => {
        p.addNode('a')
          .addNode('b')
          .addEdge('a', 'b', 'rel')
          .setEdgeProperty('a', 'b', 'rel', 'weight', 42);
      });

      expect(sha).toHaveLength(40);
      expect(persistence.commitNodeWithTree).toHaveBeenCalledTimes(1);
    });
  });
});
