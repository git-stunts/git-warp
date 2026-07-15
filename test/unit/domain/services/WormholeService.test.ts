import { describe, it, expect, vi } from 'vitest';
import {
  createWormhole as createWormholeWithCodec,
  composeWormholes,
  replayWormhole,
  serializeWormhole,
  deserializeWormhole,
} from '../../../../src/domain/services/WormholeService.ts';
import ProvenancePayload from '../../../../src/domain/services/provenance/ProvenancePayload.ts';
import WormholeError from '../../../../src/domain/errors/WormholeError.ts';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import type PatchEntry from '../../../../src/domain/artifacts/PatchEntry.ts';
import type Patch from '../../../../src/domain/types/Patch.ts';
import type { PatchCommitMessage } from '../../../../src/ports/CommitMessageCodecPort.ts';
import type PatchJournalPort from '../../../../src/ports/PatchJournalPort.ts';
import {
  DEFAULT_COMMIT_MESSAGE_CODEC,
  encodePatchMessage,
  encodeCheckpointMessage,
} from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import {
  reducePatches,
  encodeEdgeKey,
  encodePropKey,
} from '../../../../src/domain/services/JoinReducer.ts';
import { lwwValue } from '../../../../src/domain/crdt/LWW.ts';
import {
  createNodeAddV2,
  createEdgeAddV2,
  createPropSetV2,
  createPatch,
  generateOidFromNumber as generateOid,
  createPopulatedMockPersistence as createMockPersistence,
  Dot,
  createInlineValue,
} from '../../../helpers/warpGraphTestUtils.ts';

type CreateWormholeOptions = Parameters<typeof createWormholeWithCodec>[0];
type CreateWormholeTestOptions =
  Omit<CreateWormholeOptions, 'commitMessageCodec' | 'patchJournal'> &
  Partial<Pick<CreateWormholeOptions, 'commitMessageCodec' | 'patchJournal'>>;

async function createWormhole(
  options: CreateWormholeTestOptions,
): ReturnType<typeof createWormholeWithCodec> {
  return await createWormholeWithCodec({
    ...options,
    commitMessageCodec: options.commitMessageCodec ?? DEFAULT_COMMIT_MESSAGE_CODEC,
    patchJournal: options.patchJournal ?? fixturePatchJournal(options.persistence),
  });
}

function fixturePatchJournal(persistence: CreateWormholeOptions['persistence']): PatchJournalPort {
  const fixture = persistence as CreateWormholeOptions['persistence'] & {
    readonly patchJournal?: PatchJournalPort;
  };
  return fixture.patchJournal ?? patchJournalThat(async () => {
    throw new WormholeTestError('patch journal should not be read by this test');
  });
}

function patchJournalThat(
  readPatch: (message: PatchCommitMessage) => Promise<Patch>,
): PatchJournalPort {
  return {
    async appendPatch() {
      throw new WormholeTestError('appendPatch is outside this fixture');
    },
    readPatch,
    scanPatchRange(): WarpStream<PatchEntry> {
      return WarpStream.from([]);
    },
  };
}

class WormholeTestError extends Error {}

describe('WormholeService', () => {
  describe('createWormhole', () => {
    it('creates a wormhole from a single patch', async () => {
      const patch1 = createPatch({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAddV2('node-a', Dot.create('alice', 1))],
      });

      const commits = [
        { index: 1, patch: patch1, parentIndex: null, writerId: 'alice', lamport: 1 },
      ];

      const { persistence, getSha } = createMockPersistence(commits);
      const sha1 = getSha(1);

      const wormhole = await createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: sha1,
        toSha: sha1,
      });

      expect(wormhole.fromSha).toBe(sha1);
      expect(wormhole.toSha).toBe(sha1);
      expect(wormhole.writerId).toBe('alice');
      expect(wormhole.patchCount).toBe(1);
      expect(wormhole.payload).toBeInstanceOf(ProvenancePayload);
      expect(wormhole.payload.length).toBe(1);
    });

    it('creates a wormhole from multiple consecutive patches', async () => {
      const patch1 = createPatch({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAddV2('node-a', Dot.create('alice', 1))],
      });
      const patch2 = createPatch({
        writer: 'alice',
        lamport: 2,
        ops: [createNodeAddV2('node-b', Dot.create('alice', 2))],
      });
      const patch3 = createPatch({
        writer: 'alice',
        lamport: 3,
        ops: [
          createEdgeAddV2('node-a', 'node-b', 'connects', Dot.create('alice', 3)),
          createPropSetV2('node-a', 'name', createInlineValue('Alice')),
        ],
      });

      const commits = [
        { index: 1, patch: patch1, parentIndex: null, writerId: 'alice', lamport: 1 },
        { index: 2, patch: patch2, parentIndex: 1, writerId: 'alice', lamport: 2 },
        { index: 3, patch: patch3, parentIndex: 2, writerId: 'alice', lamport: 3 },
      ];

      const { persistence, getSha } = createMockPersistence(commits);
      const sha1 = getSha(1);
      const sha3 = getSha(3);

      const wormhole = await createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: sha1,
        toSha: sha3,
      });

      expect(wormhole.fromSha).toBe(sha1);
      expect(wormhole.toSha).toBe(sha3);
      expect(wormhole.writerId).toBe('alice');
      expect(wormhole.patchCount).toBe(3);
      expect(wormhole.payload.length).toBe(3);
    });

    it('throws E_WORMHOLE_SHA_NOT_FOUND for missing fromSha', async () => {
      const { persistence } = createMockPersistence([]);
      const nonexistent = generateOid(99999);

      await expect(createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: nonexistent,
        toSha: nonexistent,
      })).rejects.toMatchObject({
        code: 'E_WORMHOLE_SHA_NOT_FOUND',
        context: { sha: nonexistent },
      });
    });

    it('throws E_WORMHOLE_SHA_NOT_FOUND for missing toSha', async () => {
      const patch1 = createPatch({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAddV2('node-a', Dot.create('alice', 1))],
      });

      const commits = [
        { index: 1, patch: patch1, parentIndex: null, writerId: 'alice', lamport: 1 },
      ];

      const { persistence, getSha } = createMockPersistence(commits);
      const sha1 = getSha(1);
      const nonexistent = generateOid(99999);

      await expect(createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: sha1,
        toSha: nonexistent,
      })).rejects.toMatchObject({
        code: 'E_WORMHOLE_SHA_NOT_FOUND',
        context: { sha: nonexistent },
      });
    });

    it('throws E_WORMHOLE_INVALID_RANGE when fromSha is not ancestor of toSha', async () => {
      const patch1 = createPatch({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAddV2('node-a', Dot.create('alice', 1))],
      });
      const patch2 = createPatch({
        writer: 'alice',
        lamport: 2,
        ops: [createNodeAddV2('node-b', Dot.create('alice', 2))],
      });

      // Create two independent commits (not in same chain)
      const commits = [
        { index: 1, patch: patch1, parentIndex: null, writerId: 'alice', lamport: 1 },
        { index: 2, patch: patch2, parentIndex: null, writerId: 'alice', lamport: 2 },
      ];

      const { persistence, getSha } = createMockPersistence(commits);
      const sha1 = getSha(1);
      const sha2 = getSha(2);

      await expect(createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: sha1,
        toSha: sha2,
      })).rejects.toMatchObject({
        code: 'E_WORMHOLE_INVALID_RANGE',
      });
    });

    it('throws E_WORMHOLE_MULTI_WRITER when patches span multiple writers', async () => {
      const patch1 = createPatch({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAddV2('node-a', Dot.create('alice', 1))],
      });
      const patch2 = createPatch({
        writer: 'bob',
        lamport: 2,
        ops: [createNodeAddV2('node-b', Dot.create('bob', 1))],
      });

      const commits = [
        { index: 1, patch: patch1, parentIndex: null, writerId: 'alice', lamport: 1 },
        { index: 2, patch: patch2, parentIndex: 1, writerId: 'bob', lamport: 2 },
      ];

      const { persistence, getSha } = createMockPersistence(commits);
      const sha1 = getSha(1);
      const sha2 = getSha(2);

      await expect(createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: sha1,
        toSha: sha2,
      })).rejects.toMatchObject({
        code: 'E_WORMHOLE_MULTI_WRITER',
        context: { expectedWriter: 'bob', actualWriter: 'alice' },
      });
    });

    it('throws E_WORMHOLE_SHA_NOT_FOUND for null/undefined inputs', async () => {
      const { persistence } = createMockPersistence([]);

      await expect(createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: (null as any),
        toSha: 'something',
      })).rejects.toThrow(WormholeError);

      await expect(createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: 'something',
        toSha: (undefined as any),
      })).rejects.toThrow(WormholeError);
    });

    it('throws E_WORMHOLE_NOT_PATCH when the commit is not a patch commit', async () => {
      const sha = generateOid(4000);
      const persistence = {
        nodeExists: vi.fn(async (candidate) => candidate === sha),
        getNodeInfo: vi.fn(async () => ({
          message: encodeCheckpointMessage({
            graph: 'test-graph',
            stateHash: 'a'.repeat(64),
            frontierOid: generateOid(4001),
            indexOid: generateOid(4002),
            schema: 2,
          }),
          parents: [],
        })),
        readBlob: vi.fn(),
      };

      await expect(createWormhole({
        persistence: (persistence as any),
        graphName: 'test-graph',
        fromSha: sha,
        toSha: sha,
      })).rejects.toMatchObject({
        code: 'E_WORMHOLE_NOT_PATCH',
        context: { sha, kind: 'checkpoint' },
      });
    });

    it('throws E_WORMHOLE_INVALID_RANGE when a patch belongs to another graph', async () => {
      const sha = generateOid(5000);
      const patchOid = generateOid(5001);
      const persistence = {
        nodeExists: vi.fn(async (candidate) => candidate === sha),
        getNodeInfo: vi.fn(async () => ({
          message: encodePatchMessage({
            graph: 'other-graph',
            writer: 'alice',
            lamport: 1,
            patchOid,
          }),
          parents: [],
        })),
      };

      await expect(createWormhole({
        persistence: (persistence as any),
        graphName: 'test-graph',
        fromSha: sha,
        toSha: sha,
      })).rejects.toMatchObject({
        code: 'E_WORMHOLE_INVALID_RANGE',
        context: { sha, expectedGraph: 'test-graph', actualGraph: 'other-graph' },
      });
    });

    it('loads patch payloads through the semantic patch journal', async () => {
      const sha = generateOid(6000);
      const patchOid = generateOid(6001);
      const patch = createPatch({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAddV2('node-a', Dot.create('alice', 1))],
      });
      const persistence = {
        nodeExists: vi.fn(async (candidate) => candidate === sha),
        getNodeInfo: vi.fn(async () => ({
          message: encodePatchMessage({
            graph: 'test-graph',
            writer: 'alice',
            lamport: 1,
            patchOid,
          }),
          parents: [],
        })),
      };
      const readPatch = vi.fn(async (message: PatchCommitMessage) => {
        expect(message.patchHandle.toString()).toBe(patchOid);
        return patch;
      });

      const wormhole = await createWormhole({
        persistence: (persistence as any),
        graphName: 'test-graph',
        fromSha: sha,
        toSha: sha,
        patchJournal: patchJournalThat(readPatch),
      });

      expect(wormhole.patchCount).toBe(1);
      expect(readPatch).toHaveBeenCalledTimes(1);
    });

    it('propagates semantic patch journal read failures', async () => {
      const sha = generateOid(7000);
      const patchOid = generateOid(7001);
      const persistence = {
        nodeExists: vi.fn(async (candidate) => candidate === sha),
        getNodeInfo: vi.fn(async () => ({
          message: encodePatchMessage({
            graph: 'test-graph',
            writer: 'alice',
            lamport: 1,
            patchOid,
          }),
          parents: [],
        })),
      };
      const failure = new WormholeTestError('asset unavailable');

      await expect(createWormhole({
        persistence: (persistence as any),
        graphName: 'test-graph',
        fromSha: sha,
        toSha: sha,
        patchJournal: patchJournalThat(async () => await Promise.reject(failure)),
      })).rejects.toBe(failure);
    });
  });

  describe('replayWormhole', () => {
    it('replays a wormhole to produce correct state', async () => {
      const patch1 = createPatch({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAddV2('node-a', Dot.create('alice', 1))],
      });
      const patch2 = createPatch({
        writer: 'alice',
        lamport: 2,
        ops: [createNodeAddV2('node-b', Dot.create('alice', 2))],
      });
      const patch3 = createPatch({
        writer: 'alice',
        lamport: 3,
        ops: [
          createEdgeAddV2('node-a', 'node-b', 'connects', Dot.create('alice', 3)),
          createPropSetV2('node-a', 'name', createInlineValue('Alice')),
        ],
      });

      const commits = [
        { index: 1, patch: patch1, parentIndex: null, writerId: 'alice', lamport: 1 },
        { index: 2, patch: patch2, parentIndex: 1, writerId: 'alice', lamport: 2 },
        { index: 3, patch: patch3, parentIndex: 2, writerId: 'alice', lamport: 3 },
      ];

      const { persistence, getSha } = createMockPersistence(commits);
      const wormhole = await createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: getSha(1),
        toSha: getSha(3),
      });

      const state = replayWormhole(wormhole);

      // Verify nodes
      expect(state.nodeAlive.contains('node-a')).toBe(true);
      expect(state.nodeAlive.contains('node-b')).toBe(true);

      // Verify edge
      const edgeKey = encodeEdgeKey('node-a', 'node-b', 'connects');
      expect(state.edgeAlive.contains(edgeKey)).toBe(true);

      // Verify property
      const propKey = encodePropKey('node-a', 'name');
      expect(lwwValue(state.getEncodedProp(propKey))).toEqual(createInlineValue('Alice'));
    });

    it('replays wormhole from initial state', async () => {
      // Create initial state with a pre-existing node using valid hex SHA
      const initialSha = generateOid(99999);
      const initialPatches = [{
        patch: createPatch({
          writer: 'bob',
          lamport: 1,
          ops: [createNodeAddV2('initial-node', Dot.create('bob', 1))],
        }),
        sha: initialSha,
      }];
      const initialState = reducePatches(initialPatches);

      // Create wormhole patches
      const patch1 = createPatch({
        writer: 'alice',
        lamport: 2,
        ops: [createNodeAddV2('node-a', Dot.create('alice', 1))],
      });

      const commits = [
        { index: 1, patch: patch1, parentIndex: null, writerId: 'alice', lamport: 2 },
      ];

      const { persistence, getSha } = createMockPersistence(commits);
      const wormhole = await createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: getSha(1),
        toSha: getSha(1),
      });

      const state = replayWormhole(wormhole, initialState);

      // Both nodes should exist
      expect(state.nodeAlive.contains('initial-node')).toBe(true);
      expect(state.nodeAlive.contains('node-a')).toBe(true);
    });
  });

  describe('composeWormholes', () => {
    it('composes two consecutive wormholes', async () => {
      const patch1 = createPatch({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAddV2('node-a', Dot.create('alice', 1))],
      });
      const patch2 = createPatch({
        writer: 'alice',
        lamport: 2,
        ops: [createNodeAddV2('node-b', Dot.create('alice', 2))],
      });
      const patch3 = createPatch({
        writer: 'alice',
        lamport: 3,
        ops: [createNodeAddV2('node-c', Dot.create('alice', 3))],
      });
      const patch4 = createPatch({
        writer: 'alice',
        lamport: 4,
        ops: [createNodeAddV2('node-d', Dot.create('alice', 4))],
      });

      const commits = [
        { index: 1, patch: patch1, parentIndex: null, writerId: 'alice', lamport: 1 },
        { index: 2, patch: patch2, parentIndex: 1, writerId: 'alice', lamport: 2 },
        { index: 3, patch: patch3, parentIndex: 2, writerId: 'alice', lamport: 3 },
        { index: 4, patch: patch4, parentIndex: 3, writerId: 'alice', lamport: 4 },
      ];

      const { persistence, getSha } = createMockPersistence(commits);

      // Create two wormholes
      const wormhole1 = await createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: getSha(1),
        toSha: getSha(2),
      });

      const wormhole2 = await createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: getSha(3),
        toSha: getSha(4),
      });

      // Compose them
      const composed = await composeWormholes(wormhole1, wormhole2, { persistence });

      expect(composed.fromSha).toBe(getSha(1));
      expect(composed.toSha).toBe(getSha(4));
      expect(composed.writerId).toBe('alice');
      expect(composed.patchCount).toBe(4);
      expect(composed.payload.length).toBe(4);

      // Verify replay produces correct state
      const state = replayWormhole(composed);
      expect(state.nodeAlive.contains('node-a')).toBe(true);
      expect(state.nodeAlive.contains('node-b')).toBe(true);
      expect(state.nodeAlive.contains('node-c')).toBe(true);
      expect(state.nodeAlive.contains('node-d')).toBe(true);
    });

    it('throws E_WORMHOLE_MULTI_WRITER for different writers', async () => {
      // Create mock wormholes with different writers
      const wormhole1 = {
        fromSha: generateOid(1000),
        toSha: generateOid(2000),
        writerId: 'alice',
        patchCount: 2,
        payload: new ProvenancePayload([]),
      };

      const wormhole2 = {
        fromSha: generateOid(3000),
        toSha: generateOid(4000),
        writerId: 'bob',
        patchCount: 2,
        payload: new ProvenancePayload([]),
      };

      await expect(composeWormholes(wormhole1, wormhole2)).rejects.toMatchObject({
        code: 'E_WORMHOLE_MULTI_WRITER',
      });
    });

    it('throws E_WORMHOLE_INVALID_RANGE when persistence proves wormholes are not consecutive', async () => {
      const wormhole1 = {
        fromSha: generateOid(9000),
        toSha: generateOid(9001),
        writerId: 'alice',
        patchCount: 1,
        payload: new ProvenancePayload([]),
      };
      const wormhole2 = {
        fromSha: generateOid(9002),
        toSha: generateOid(9003),
        writerId: 'alice',
        patchCount: 1,
        payload: new ProvenancePayload([]),
      };
      const persistence = {
        getNodeInfo: vi.fn(async () => ({ parents: [generateOid(9999)] })),
      };

      await expect(composeWormholes(
        (wormhole1 as any),
        (wormhole2 as any),
        { persistence: (persistence as any) },
      )).rejects.toMatchObject({
        code: 'E_WORMHOLE_INVALID_RANGE',
        context: {
          firstToSha: wormhole1.toSha,
          secondFromSha: wormhole2.fromSha,
        },
      });
    });

    it('composition is associative (monoid property)', async () => {
      const patches: any[] = [];
      for (let i = 1; i <= 6; i++) {
        patches.push(createPatch({
          writer: 'alice',
          lamport: i,
          ops: [createNodeAddV2(`node-${i}`, Dot.create('alice', i))],
        }));
      }

      const commits = patches.map((patch, i) => ({
        index: i + 1,
        patch,
        parentIndex: i > 0 ? i : null,
        writerId: 'alice',
        lamport: i + 1,
      }));

      const { persistence, getSha } = createMockPersistence(commits);

      // Create three wormholes
      const w1 = await createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: getSha(1),
        toSha: getSha(2),
      });

      const w2 = await createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: getSha(3),
        toSha: getSha(4),
      });

      const w3 = await createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: getSha(5),
        toSha: getSha(6),
      });

      // Test associativity: (w1 . w2) . w3 === w1 . (w2 . w3)
      const leftAssoc = await composeWormholes(await composeWormholes(w1, w2, { persistence }), w3, { persistence });
      const rightAssoc = await composeWormholes(w1, await composeWormholes(w2, w3, { persistence }), { persistence });

      // Both should have same properties
      expect(leftAssoc.fromSha).toBe(rightAssoc.fromSha);
      expect(leftAssoc.toSha).toBe(rightAssoc.toSha);
      expect(leftAssoc.patchCount).toBe(rightAssoc.patchCount);

      // Both should produce same state
      const stateLeft = replayWormhole(leftAssoc);
      const stateRight = replayWormhole(rightAssoc);

      for (let i = 1; i <= 6; i++) {
        expect(stateLeft.nodeAlive.contains(`node-${i}`)).toBe(
          stateRight.nodeAlive.contains(`node-${i}`)
        );
      }
    });
  });

  describe('serialization', () => {
    it('roundtrips correctly', async () => {
      const patch1 = createPatch({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAddV2('node-a', Dot.create('alice', 1))],
      });
      const patch2 = createPatch({
        writer: 'alice',
        lamport: 2,
        ops: [
          createNodeAddV2('node-b', Dot.create('alice', 2)),
          createPropSetV2('node-a', 'val', createInlineValue(42)),
        ],
      });

      const commits = [
        { index: 1, patch: patch1, parentIndex: null, writerId: 'alice', lamport: 1 },
        { index: 2, patch: patch2, parentIndex: 1, writerId: 'alice', lamport: 2 },
      ];

      const { persistence, getSha } = createMockPersistence(commits);
      const original = await createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: getSha(1),
        toSha: getSha(2),
      });

      // Serialize and deserialize
      const json = serializeWormhole(original);
      const restored = deserializeWormhole(json);

      expect(restored.fromSha).toBe(original.fromSha);
      expect(restored.toSha).toBe(original.toSha);
      expect(restored.writerId).toBe(original.writerId);
      expect(restored.patchCount).toBe(original.patchCount);
      expect(restored.payload.length).toBe(original.payload.length);

      // Replaying both should produce same state
      const stateOriginal = replayWormhole(original);
      const stateRestored = replayWormhole(restored);

      expect(stateOriginal.nodeAlive.contains('node-a')).toBe(
        stateRestored.nodeAlive.contains('node-a')
      );
      expect(stateOriginal.nodeAlive.contains('node-b')).toBe(
        stateRestored.nodeAlive.contains('node-b')
      );
    });

    it('throws on null/undefined input', () => {
      expect(() => deserializeWormhole((null as any))).toThrow(WormholeError);
      expect(() => deserializeWormhole((null as any))).toThrow('expected object');
      expect(() => deserializeWormhole((undefined as any))).toThrow(WormholeError);
    });

    it('throws on missing required fields', () => {
      const validBase = {
        fromSha: 'abc123',
        toSha: 'def456',
        writerId: 'alice',
        patchCount: 2,
        payload: { version: 1, patches: [] },
      };

      // Test each required field
      for (const field of ['fromSha', 'toSha', 'writerId', 'patchCount', 'payload']) {
        const incomplete: any = { ...validBase };
        delete incomplete[field];
        expect(() => deserializeWormhole(incomplete)).toThrow(`missing required field '${field}'`);
      }
    });

    it('throws on invalid patchCount', () => {
      expect(() => deserializeWormhole({
        fromSha: 'abc123',
        toSha: 'def456',
        writerId: 'alice',
        patchCount: -1,
        payload: { version: 1, patches: [] },
      })).toThrow('patchCount must be a non-negative number');

      expect(() => deserializeWormhole({
        fromSha: 'abc123',
        toSha: 'def456',
        writerId: 'alice',
        patchCount: 'two',
        payload: { version: 1, patches: [] },
      })).toThrow('patchCount must be a non-negative number');
    });

    it('throws when fromSha is not a string', () => {
      expect(() => deserializeWormhole({
        fromSha: 123,
        toSha: 'def456',
        writerId: 'alice',
        patchCount: 1,
        payload: { version: 1, patches: [] },
      })).toThrow("fromSha' must be a string");
    });
  });

  describe('materialization equivalence', () => {
    it('wormhole + remaining patches produces same state as all patches', async () => {
      // Create 10 patches
      const patches: any[] = [];
      for (let i = 1; i <= 10; i++) {
        patches.push(createPatch({
          writer: 'alice',
          lamport: i,
          ops: [
            createNodeAddV2(`node-${i}`, Dot.create('alice', i)),
            createPropSetV2(`node-${i}`, 'index', createInlineValue(i)),
          ],
        }));
      }

      const commits = patches.map((patch, i) => ({
        index: i + 1,
        patch,
        parentIndex: i > 0 ? i : null,
        writerId: 'alice',
        lamport: i + 1,
      }));

      const { persistence, getSha } = createMockPersistence(commits);

      // Create wormhole of first 5 patches
      const wormhole = await createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: getSha(1),
        toSha: getSha(5),
      });

      // Replay wormhole, then apply remaining patches
      const wormholeState = replayWormhole(wormhole);
      const remainingPatches = patches.slice(5).map((patch, i) => ({
        patch,
        sha: getSha(i + 6),
      }));
      const remainingPayload = new ProvenancePayload(remainingPatches);
      const wormholeResult = remainingPayload.replay(wormholeState);

      // Full materialization
      const allPatches = patches.map((patch, i) => ({
        patch,
        sha: getSha(i + 1),
      }));
      const fullResult = reducePatches(allPatches);

      // Verify both produce same state
      for (let i = 1; i <= 10; i++) {
        expect(wormholeResult.nodeAlive.contains(`node-${i}`)).toBe(
          fullResult.nodeAlive.contains(`node-${i}`)
        );
        const propKey = encodePropKey(`node-${i}`, 'index');
        expect(lwwValue(wormholeResult.getEncodedProp(propKey))).toEqual(
          lwwValue(fullResult.getEncodedProp(propKey))
        );
      }
    });

    it('multiple wormholes produce same state as all patches', async () => {
      // Create 20 patches
      const patches: any[] = [];
      for (let i = 1; i <= 20; i++) {
        patches.push(createPatch({
          writer: 'alice',
          lamport: i,
          ops: [createNodeAddV2(`node-${i}`, Dot.create('alice', i))],
        }));
      }

      const commits = patches.map((patch, i) => ({
        index: i + 1,
        patch,
        parentIndex: i > 0 ? i : null,
        writerId: 'alice',
        lamport: i + 1,
      }));

      const { persistence, getSha } = createMockPersistence(commits);

      // Create three wormholes: 1-5, 6-10, 11-15
      const w1 = await createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: getSha(1),
        toSha: getSha(5),
      });

      const w2 = await createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: getSha(6),
        toSha: getSha(10),
      });

      const w3 = await createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: getSha(11),
        toSha: getSha(15),
      });

      // Compose all three
      const composed = await composeWormholes(
        await composeWormholes(w1, w2, { persistence }),
        w3,
        { persistence }
      );

      // Replay composed wormhole + remaining patches (16-20)
      const wormholeState = replayWormhole(composed);
      const remainingPatches = patches.slice(15).map((patch, i) => ({
        patch,
        sha: getSha(i + 16),
      }));
      const remainingPayload = new ProvenancePayload(remainingPatches);
      const wormholeResult = remainingPayload.replay(wormholeState);

      // Full materialization
      const allPatches = patches.map((patch, i) => ({
        patch,
        sha: getSha(i + 1),
      }));
      const fullResult = reducePatches(allPatches);

      // Verify both produce same state
      for (let i = 1; i <= 20; i++) {
        expect(wormholeResult.nodeAlive.contains(`node-${i}`)).toBe(
          fullResult.nodeAlive.contains(`node-${i}`)
        );
      }
    });
  });

  describe('edge cases', () => {
    it('handles wormhole of single patch at start of chain', async () => {
      const patch1 = createPatch({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAddV2('root', Dot.create('alice', 1))],
      });

      const commits = [
        { index: 1, patch: patch1, parentIndex: null, writerId: 'alice', lamport: 1 },
      ];

      const { persistence, getSha } = createMockPersistence(commits);
      const wormhole = await createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: getSha(1),
        toSha: getSha(1),
      });

      expect(wormhole.patchCount).toBe(1);
      const state = replayWormhole(wormhole);
      expect(state.nodeAlive.contains('root')).toBe(true);
    });

    it('handles wormhole with complex operations', async () => {
      const patch1 = createPatch({
        writer: 'alice',
        lamport: 1,
        ops: [
          createNodeAddV2('a', Dot.create('alice', 1)),
          createNodeAddV2('b', Dot.create('alice', 2)),
          createEdgeAddV2('a', 'b', 'link1', Dot.create('alice', 3)),
          createEdgeAddV2('b', 'a', 'link2', Dot.create('alice', 4)),
          createPropSetV2('a', 'x', createInlineValue(1)),
          createPropSetV2('a', 'y', createInlineValue(2)),
          createPropSetV2('b', 'z', createInlineValue(3)),
        ],
      });

      const commits = [
        { index: 1, patch: patch1, parentIndex: null, writerId: 'alice', lamport: 1 },
      ];

      const { persistence, getSha } = createMockPersistence(commits);
      const wormhole = await createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: getSha(1),
        toSha: getSha(1),
      });

      const state = replayWormhole(wormhole);

      expect(state.nodeAlive.contains('a')).toBe(true);
      expect(state.nodeAlive.contains('b')).toBe(true);
      expect(state.edgeAlive.contains(encodeEdgeKey('a', 'b', 'link1'))).toBe(true);
      expect(state.edgeAlive.contains(encodeEdgeKey('b', 'a', 'link2'))).toBe(true);
      expect(lwwValue(state.getEncodedProp(encodePropKey('a', 'x')))).toEqual(createInlineValue(1));
      expect(lwwValue(state.getEncodedProp(encodePropKey('a', 'y')))).toEqual(createInlineValue(2));
      expect(lwwValue(state.getEncodedProp(encodePropKey('b', 'z')))).toEqual(createInlineValue(3));
    });
  });
});
