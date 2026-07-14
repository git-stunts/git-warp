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

const crypto = new NodeCryptoAdapter();

type RuntimeHostOptions = Parameters<typeof openRuntimeHostProduct>[0];
type RuntimeHostTestProduct = Awaited<ReturnType<typeof openRuntimeHostProduct>>;
type PatchBuilderLamportView = PatchBuilder & { _lamport: number };
type EffectPipelineGraph = RuntimeHostTestProduct & {
  _effectPipeline: {
    lens: {
      mode: string;
      suppressExternal: boolean;
    };
  };
};
type TrustGateGraph = RuntimeHostTestProduct & {
  _createSyncTrustGate(): {
    evaluate(writerIds: readonly string[]): Promise<{
      allowed: boolean;
      untrustedWriters: readonly string[];
      verdict: string;
    }>;
  };
};

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

/**
 * Creates a mock patch commit structure for testing.
 * @param {object} options
 * @param {string} options.sha - The commit SHA
 * @param {string} options.graphName - The graph name
 * @param {string} options.writerId - The writer ID
 * @param {number} options.lamport - The lamport timestamp
 * @param {string} options.patchOid - The patch blob OID
 * @param {object[]} options.ops - The operations in the patch (schema:2 format with dots)
 * @param {string|null} [options.parentSha] - The parent commit SHA
 * @param {Map<string, number>|Record<string, number>|null} [options.context] - The context VV for schema:2 patches
 */
function createMockPatch({ sha, graphName, writerId, lamport, patchOid, ops, parentSha = null, context = null }: {
  sha: string;
  graphName: string;
  writerId: string;
  lamport: number;
  patchOid: string;
  ops: object[];
  parentSha?: string | null;
  context?: Map<string, number> | Record<string, number> | null;
}) {
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
  it('test fixture compareAndSwapRef rejects expected-head mismatches', async () => {
    const persistence = createMockPersistence();
    const currentSha = 'a'.repeat(40);
    const nextSha = 'b'.repeat(40);
    persistence.readRef.mockResolvedValue(currentSha);

    await expect(
      persistence.compareAndSwapRef('refs/warp/events/writers/writer-1', nextSha, null)
    ).rejects.toThrow('CAS mismatch');
  });

  describe('open', () => {
    it('creates a graph instance with valid parameters', async () => {
      const persistence = createMockPersistence();

      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      expect(graph.graphName).toBe('events');
      expect(graph.writerId).toBe('node-1');
      expect(graph.persistence).toBe(persistence);
    });

    it('rejects invalid graph name', async () => {
      const persistence = createMockPersistence();

      await expect(
        openRuntimeHostProduct({
          persistence,
          graphName: '../etc',
          writerId: 'node-1',
        })
      ).rejects.toThrow('path traversal');
    });

    it('rejects empty graph name', async () => {
      const persistence = createMockPersistence();

      await expect(
        openRuntimeHostProduct({
          persistence,
          graphName: '',
          writerId: 'node-1',
        })
      ).rejects.toThrow('cannot be empty');
    });

    it('rejects invalid writer ID', async () => {
      const persistence = createMockPersistence();

      await expect(
        openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node/1',
        })
      ).rejects.toThrow('forward slash');
    });

    it('rejects empty writer ID', async () => {
      const persistence = createMockPersistence();

      await expect(
        openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: '',
        })
      ).rejects.toThrow('cannot be empty');
    });

    it('rejects missing persistence', async () => {
      await expect(
        openRuntimeHostProduct({
          persistence: null as never,
          graphName: 'events',
          writerId: 'node-1',
        })
      ).rejects.toThrow('persistence is required');
    });

    it('accepts valid graph names', async () => {
      const persistence = createMockPersistence();
      const validNames = ['events', 'my-graph', 'Graph_v2', 'team/shared'];

      for (const graphName of validNames) {
        const graph = await openRuntimeHostProduct({
          persistence,
          graphName,
          writerId: 'node-1',
        });
        expect(graph.graphName).toBe(graphName);
      }
    });

    it('accepts valid writer IDs', async () => {
      const persistence = createMockPersistence();
      const validIds = ['node-1', 'writer_01', 'Producer.v2', 'a'];

      for (const writerId of validIds) {
        const graph = await openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId,
        });
        expect(graph.writerId).toBe(writerId);
      }
    });

    it('rejects non-object trust config', async () => {
      const persistence = createMockPersistence();

      await expect(
        openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          trust: 'log-only' as never,
        })
      ).rejects.toThrow('trust must be an object');
    });

    it('rejects invalid trust mode', async () => {
      const persistence = createMockPersistence();

      await expect(
        openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          trust: { mode: 'bogus' } as never,
        })
      ).rejects.toThrow('trust.mode must be one of: off, log-only, enforce');
    });

    it('rejects non-string trust pins', async () => {
      const persistence = createMockPersistence();

      await expect(
        openRuntimeHostProduct({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          trust: { pin: 123 } as never,
        })
      ).rejects.toThrow('trust.pin must be a string');
    });

    it('auto-constructs an effect pipeline with LIVE_LENS when effect sinks are provided', async () => {
      const persistence = createMockPersistence();

      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        effectSinks: [new NoOpEffectSink()],
      });

      const effectGraph = graph as EffectPipelineGraph;
      expect(effectGraph._effectPipeline).toBeDefined();
      expect(effectGraph._effectPipeline.lens.mode).toBe('live');
      expect(effectGraph._effectPipeline.lens.suppressExternal).toBe(false);
    });

    it('creates trust gates that forward pin and mode to audit verification', async () => {
      const persistence = createMockPersistence();
      const logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        child: vi.fn(),
      };
      logger.child.mockReturnValue(logger);
      const evaluateTrustSpy = vi.spyOn(AuditVerifierService.prototype, 'evaluateTrust')
        .mockResolvedValue({
          trust: {
            explanations: [
              { writerId: 'alice', trusted: true, reason: '', reasonCode: '' },
              { writerId: 'bob', trusted: false, reason: '', reasonCode: '' },
            ],
          },
        } as never);

      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        logger,
        trust: { mode: 'enforce', pin: 'pin-123' },
      });

      const trustGateGraph = graph as TrustGateGraph;
      const gate = trustGateGraph._createSyncTrustGate();
      const result = await gate.evaluate(['alice', 'bob']);

      expect(evaluateTrustSpy).toHaveBeenCalledWith('events', {
        pin: 'pin-123',
        mode: 'enforce',
        writerIds: ['alice', 'bob'],
      });
      expect(result).toEqual({
        allowed: false,
        untrustedWriters: ['bob'],
        verdict: 'rejected',
      });

      evaluateTrustSpy.mockRestore();
    });
  });

  describe('createPatch', () => {
    it('returns a PatchBuilder instance for schema:2 (default)', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      const patchBuilder = await graph.createPatch();

      expect(patchBuilder).toBeInstanceOf(PatchBuilder);
    });

    it('creates a PatchBuilder with correct configuration', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'my-events',
        writerId: 'writer-42',
        schema: 2,
      } as RuntimeHostOptions);

      // Set up mock responses for commit
      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob.mockResolvedValue('a'.repeat(40));
      persistence.writeTree.mockResolvedValue('a'.repeat(40));
      persistence.commitNodeWithTree.mockResolvedValue('a'.repeat(40));

      const patchBuilder = await graph.createPatch();
      patchBuilder.addNode('test');
      await patchBuilder.commit();

      // Verify the ref was atomically advanced with the correct graph/writer path
      expect(persistence.compareAndSwapRef).toHaveBeenCalledWith(
        'refs/warp/my-events/writers/writer-42',
        expect.any(String),
        null,
      );
    });

    it('uses correct lamport from existing writer ref (first commit)', async () => {
      const persistence = createMockPersistence();
      // No existing ref - first commit
      persistence.readRef.mockResolvedValue(null);

      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        schema: 2,
      } as RuntimeHostOptions);

      const patchBuilder = await graph.createPatch();

      // First commit should have lamport 1
      expect(Object.getOwnPropertyDescriptor(patchBuilder, '_lamport')?.value).toBe(1);
    });

    it('uses correct lamport from existing writer ref (continuing)', async () => {
      const persistence = createMockPersistence();
      const existingSha = 'd'.repeat(40);
      const existingPatchOid = 'e'.repeat(40);

      // During open(): checkpoint check returns null
      // During createPatch(): _nextLamport calls readRef(writerRef) which returns existingSha
      persistence.readRef.mockImplementation((ref: string) => {
        if (ref.includes('checkpoints')) return Promise.resolve(null);
        if (ref.includes('writers')) return Promise.resolve(existingSha);
        return Promise.resolve(null);
      });

      persistence.listRefs.mockResolvedValue([]);

      persistence.showNode.mockResolvedValue(
        `warp:patch\n\neg-kind: patch\neg-graph: test-graph\neg-writer: writer1\neg-lamport: 7\neg-patch-oid: ${existingPatchOid}\neg-schema: 2`
      );

      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        schema: 2,
      } as RuntimeHostOptions);

      const patchBuilder = await graph.createPatch();

      // Should be 7 + 1 = 8
      expect(Object.getOwnPropertyDescriptor(patchBuilder, '_lamport')?.value).toBe(8);
    });

    it('throws error on malformed lamport trailer', async () => {
      const persistence = createMockPersistence();
      const existingSha = 'd'.repeat(40);

      // During open(): checkpoint check returns null, listRefs returns []
      // During createPatch(): _nextLamport calls readRef(writerRef)
      persistence.readRef.mockImplementation((ref: string) => {
        if (ref.includes('checkpoints')) return Promise.resolve(null);
        if (ref.includes('writers')) return Promise.resolve(existingSha);
        return Promise.resolve(null);
      });

      persistence.listRefs.mockResolvedValue([]);

      // Malformed message - eg-lamport has non-integer value
      persistence.showNode.mockResolvedValue(
        'warp:patch\n\neg-kind: patch\neg-graph: test-graph\neg-writer: writer1\neg-lamport: not-a-number\neg-patch-oid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\neg-schema: 2'
      );

      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        schema: 2,
      } as RuntimeHostOptions);

      await expect(graph.createPatch()).rejects.toThrow(/Failed to parse lamport/);
    });
  });

  describe('discoverWriters', () => {
    it('returns sorted array of writer IDs from refs', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      persistence.listRefs.mockResolvedValue([
        'refs/warp/events/writers/writer-b',
        'refs/warp/events/writers/writer-a',
      ]);

      const writers = await graph.discoverWriters();

      expect(writers).toEqual(['writer-a', 'writer-b']);
      expect(persistence.listRefs).toHaveBeenCalledWith('refs/warp/events/writers/');
    });

    it('returns empty array when no writers exist', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      persistence.listRefs.mockResolvedValue([]);

      const writers = await graph.discoverWriters();

      expect(writers).toEqual([]);
    });

    it('filters out invalid writer IDs from refs', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      persistence.listRefs.mockResolvedValue([
        'refs/warp/events/writers/valid-writer',
        'refs/warp/events/checkpoints/head', // Not a writer ref
      ]);

      const writers = await graph.discoverWriters();

      expect(writers).toEqual(['valid-writer']);
    });
  });

  describe('materialize', () => {
    it('returns empty state when no writers exist', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        schema: 2,
      } as RuntimeHostOptions);

      persistence.listRefs.mockResolvedValue([]);

      const state = (await graph.materialize());

      expect(state.nodeAlive).toBeDefined();
      expect(state.edgeAlive).toBeDefined();
      expect(state.prop).toBeInstanceOf(Map);
    });

    it('materializes state from single writer', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        schema: 2,
      } as RuntimeHostOptions);

      const patchOid = 'a'.repeat(40);
      const commitSha = 'b'.repeat(40);

      // Create a patch that adds a node (schema:2 format with dot)
      const mockPatch = createMockPatch({
        sha: commitSha,
        graphName: 'events',
        writerId: 'writer-1',
        lamport: 1,
        patchOid,
        ops: [{ type: 'NodeAdd', node: 'user:alice', dot: Dot.create('writer-1', 1) }],
        parentSha: null,
      });

      persistence.listRefs.mockResolvedValue(['refs/warp/events/writers/writer-1']);
      persistence.readRef.mockResolvedValue(commitSha);
      persistence.getNodeInfo.mockResolvedValue(mockPatch.nodeInfo);
      persistence.readBlob.mockResolvedValue(mockPatch.patchBuffer);

      const state = (await graph.materialize());

      // V5 state uses ORSet - check using ORSet API
      expect(state.nodeAlive.contains('user:alice')).toBe(true);
    });

    it('materializes state from multiple writers', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        schema: 2,
      } as RuntimeHostOptions);

      const patchOid1 = 'a'.repeat(40);
      const commitSha1 = 'b'.repeat(40);
      const patchOid2 = 'c'.repeat(40);
      const commitSha2 = 'd'.repeat(40);

      // Create patches for two writers (schema:2 format with dots)
      const mockPatch1 = createMockPatch({
        sha: commitSha1,
        graphName: 'events',
        writerId: 'writer-1',
        lamport: 1,
        patchOid: patchOid1,
        ops: [{ type: 'NodeAdd', node: 'user:alice', dot: Dot.create('writer-1', 1) }],
        parentSha: null,
      });

      const mockPatch2 = createMockPatch({
        sha: commitSha2,
        graphName: 'events',
        writerId: 'writer-2',
        lamport: 1,
        patchOid: patchOid2,
        ops: [{ type: 'NodeAdd', node: 'user:bob', dot: Dot.create('writer-2', 1) }],
        parentSha: null,
      });

      persistence.listRefs.mockResolvedValue([
        'refs/warp/events/writers/writer-1',
        'refs/warp/events/writers/writer-2',
      ]);

      // materialize() now checks for checkpoint first, then reads writer tips
      persistence.readRef
        .mockResolvedValueOnce(null)       // checkpoint ref (none)
        .mockResolvedValueOnce(commitSha1) // writer-1 tip
        .mockResolvedValueOnce(commitSha2); // writer-2 tip

      persistence.getNodeInfo
        .mockResolvedValueOnce(mockPatch1.nodeInfo)
        .mockResolvedValueOnce(mockPatch2.nodeInfo);

      persistence.readBlob
        .mockResolvedValueOnce(mockPatch1.patchBuffer)
        .mockResolvedValueOnce(mockPatch2.patchBuffer);

      const state = (await graph.materialize());
      // V5 state uses ORSet
      expect(state.nodeAlive.contains('user:alice')).toBe(true);
      expect(state.nodeAlive.contains('user:bob')).toBe(true);
    });

    it('materializes chain of patches from single writer', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        schema: 2,
      } as RuntimeHostOptions);

      const patchOid1 = 'a'.repeat(40);
      const commitSha1 = 'b'.repeat(40);
      const patchOid2 = 'c'.repeat(40);
      const commitSha2 = 'd'.repeat(40);

      // Create two patches in a chain (schema:2 format with dots)
      const mockPatch1 = createMockPatch({
        sha: commitSha1,
        graphName: 'events',
        writerId: 'writer-1',
        lamport: 1,
        patchOid: patchOid1,
        ops: [{ type: 'NodeAdd', node: 'user:alice', dot: Dot.create('writer-1', 1) }],
        parentSha: null,
      });

      const mockPatch2 = createMockPatch({
        sha: commitSha2,
        graphName: 'events',
        writerId: 'writer-1',
        lamport: 2,
        patchOid: patchOid2,
        ops: [{ type: 'NodeAdd', node: 'user:bob', dot: Dot.create('writer-1', 2) }],
        parentSha: commitSha1,
        context: { 'writer-1': 2 },
      });

      persistence.listRefs.mockResolvedValue(['refs/warp/events/writers/writer-1']);
      persistence.readRef.mockResolvedValue(commitSha2); // tip is the second commit

      // getNodeInfo is called for each commit in the chain (newest first)
      persistence.getNodeInfo
        .mockResolvedValueOnce(mockPatch2.nodeInfo) // First call for tip
        .mockResolvedValueOnce(mockPatch1.nodeInfo); // Second call for parent

      persistence.readBlob
        .mockResolvedValueOnce(mockPatch2.patchBuffer)
        .mockResolvedValueOnce(mockPatch1.patchBuffer);

      const state = (await graph.materialize());

      // V5 state uses ORSet
      expect(state.nodeAlive.contains('user:alice')).toBe(true);
      expect(state.nodeAlive.contains('user:bob')).toBe(true);
    });

    it('returns empty state when writer ref returns null', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        schema: 2,
      } as RuntimeHostOptions);

      persistence.listRefs.mockResolvedValue(['refs/warp/events/writers/writer-1']);
      persistence.readRef.mockResolvedValue(null);

      const state = (await graph.materialize());

      // V5 state uses ORSet
      expect(state.nodeAlive.countEntries()).toBe(0);
    });
  });

  describe('materializeAt', () => {
    it('rejects retired checkpoint schemas in materializeAt()', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      const checkpointSha = 'a'.repeat(40);
      const indexOid = 'e'.repeat(40);

      // Mock checkpoint data (schema:2 required)
      const checkpointMessage = `warp:checkpoint

eg-kind: checkpoint
eg-graph: events
eg-state-hash: ${'c'.repeat(64)}
eg-frontier-oid: ${'d'.repeat(40)}
eg-index-oid: ${indexOid}
eg-schema: 2`;

      persistence.showNode.mockResolvedValue(checkpointMessage);
      persistence.getNodeInfo.mockResolvedValue({
        sha: checkpointSha,
        message: checkpointMessage,
        parents: [],
      });

      await expect(graph.materializeAt(checkpointSha)).rejects.toMatchObject({
        code: 'E_CHECKPOINT_UNSUPPORTED_SCHEMA',
      });
      expect(persistence.readTreeOids).not.toHaveBeenCalled();
    });
  });

  describe('property accessors', () => {
    it('exposes graphName', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'my-graph',
        writerId: 'node-1',
      });

      expect(graph.graphName).toBe('my-graph');
    });

    it('exposes writerId', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'my-writer',
      });

      expect(graph.writerId).toBe('my-writer');
    });

    it('exposes persistence', async () => {
      const persistence = createMockPersistence();
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      expect(graph.persistence).toBe(persistence);
    });
  });

});
