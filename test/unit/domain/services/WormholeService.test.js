import { describe, it, expect } from 'vitest';
import {
  createWormhole,
  composeWormholes,
  replayWormhole,
  serializeWormhole,
  deserializeWormhole,
} from '../../../../src/domain/services/WormholeService.js';
import ProvenancePayload from '../../../../src/domain/services/ProvenancePayload.js';
import WormholeError from '../../../../src/domain/errors/WormholeError.js';
import {
  reduceV5,
  encodeEdgeKey,
  encodePropKey,
} from '../../../../src/domain/services/JoinReducer.js';
import { orsetContains } from '../../../../src/domain/crdt/ORSet.js';
import { lwwValue } from '../../../../src/domain/crdt/LWW.js';
import {
  createNodeAddV2,
  createEdgeAddV2,
  createPropSetV2,
  createPatchV2,
  generateOidFromNumber as generateOid,
  createPopulatedMockPersistence as createMockPersistence,
  createDot,
  createInlineValue,
} from '../../../helpers/warpGraphTestUtils.js';

describe('WormholeService', () => {
  describe('createWormhole', () => {
    it('creates a wormhole from a single patch', async () => {
      const patch1 = createPatchV2({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAddV2('node-a', createDot('alice', 1))],
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
      const patch1 = createPatchV2({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAddV2('node-a', createDot('alice', 1))],
      });
      const patch2 = createPatchV2({
        writer: 'alice',
        lamport: 2,
        ops: [createNodeAddV2('node-b', createDot('alice', 2))],
      });
      const patch3 = createPatchV2({
        writer: 'alice',
        lamport: 3,
        ops: [
          createEdgeAddV2('node-a', 'node-b', 'connects', createDot('alice', 3)),
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
      const patch1 = createPatchV2({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAddV2('node-a', createDot('alice', 1))],
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
      const patch1 = createPatchV2({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAddV2('node-a', createDot('alice', 1))],
      });
      const patch2 = createPatchV2({
        writer: 'alice',
        lamport: 2,
        ops: [createNodeAddV2('node-b', createDot('alice', 2))],
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
      const patch1 = createPatchV2({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAddV2('node-a', createDot('alice', 1))],
      });
      const patch2 = createPatchV2({
        writer: 'bob',
        lamport: 2,
        ops: [createNodeAddV2('node-b', createDot('bob', 1))],
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
        fromSha: null,
        toSha: 'something',
      })).rejects.toThrow(WormholeError);

      await expect(createWormhole({
        persistence,
        graphName: 'test-graph',
        fromSha: 'something',
        toSha: undefined,
      })).rejects.toThrow(WormholeError);
    });
  });

  describe('replayWormhole', () => {
    it('replays a wormhole to produce correct state', async () => {
      const patch1 = createPatchV2({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAddV2('node-a', createDot('alice', 1))],
      });
      const patch2 = createPatchV2({
        writer: 'alice',
        lamport: 2,
        ops: [createNodeAddV2('node-b', createDot('alice', 2))],
      });
      const patch3 = createPatchV2({
        writer: 'alice',
        lamport: 3,
        ops: [
          createEdgeAddV2('node-a', 'node-b', 'connects', createDot('alice', 3)),
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
      expect(orsetContains(state.nodeAlive, 'node-a')).toBe(true);
      expect(orsetContains(state.nodeAlive, 'node-b')).toBe(true);

      // Verify edge
      const edgeKey = encodeEdgeKey('node-a', 'node-b', 'connects');
      expect(orsetContains(state.edgeAlive, edgeKey)).toBe(true);

      // Verify property
      const propKey = encodePropKey('node-a', 'name');
      expect(lwwValue(state.prop.get(propKey))).toEqual(createInlineValue('Alice'));
    });

    it('replays wormhole from initial state', async () => {
      // Create initial state with a pre-existing node using valid hex SHA
      const initialSha = generateOid(99999);
      const initialPatches = [{
        patch: createPatchV2({
          writer: 'bob',
          lamport: 1,
          ops: [createNodeAddV2('initial-node', createDot('bob', 1))],
        }),
        sha: initialSha,
      }];
      const initialState = reduceV5(initialPatches);

      // Create wormhole patches
      const patch1 = createPatchV2({
        writer: 'alice',
        lamport: 2,
        ops: [createNodeAddV2('node-a', createDot('alice', 1))],
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
      expect(orsetContains(state.nodeAlive, 'initial-node')).toBe(true);
      expect(orsetContains(state.nodeAlive, 'node-a')).toBe(true);
    });
  });

  describe('composeWormholes', () => {
    it('composes two consecutive wormholes', async () => {
      const patch1 = createPatchV2({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAddV2('node-a', createDot('alice', 1))],
      });
      const patch2 = createPatchV2({
        writer: 'alice',
        lamport: 2,
        ops: [createNodeAddV2('node-b', createDot('alice', 2))],
      });
      const patch3 = createPatchV2({
        writer: 'alice',
        lamport: 3,
        ops: [createNodeAddV2('node-c', createDot('alice', 3))],
      });
      const patch4 = createPatchV2({
        writer: 'alice',
        lamport: 4,
        ops: [createNodeAddV2('node-d', createDot('alice', 4))],
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
      expect(orsetContains(state.nodeAlive, 'node-a')).toBe(true);
      expect(orsetContains(state.nodeAlive, 'node-b')).toBe(true);
      expect(orsetContains(state.nodeAlive, 'node-c')).toBe(true);
      expect(orsetContains(state.nodeAlive, 'node-d')).toBe(true);
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

    it('composition is associative (monoid property)', async () => {
      const patches = [];
      for (let i = 1; i <= 6; i++) {
        patches.push(createPatchV2({
          writer: 'alice',
          lamport: i,
          ops: [createNodeAddV2(`node-${i}`, createDot('alice', i))],
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
        expect(orsetContains(stateLeft.nodeAlive, `node-${i}`)).toBe(
          orsetContains(stateRight.nodeAlive, `node-${i}`)
        );
      }
    });
  });

  describe('serialization', () => {
    it('roundtrips correctly', async () => {
      const patch1 = createPatchV2({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAddV2('node-a', createDot('alice', 1))],
      });
      const patch2 = createPatchV2({
        writer: 'alice',
        lamport: 2,
        ops: [
          createNodeAddV2('node-b', createDot('alice', 2)),
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

      expect(orsetContains(stateOriginal.nodeAlive, 'node-a')).toBe(
        orsetContains(stateRestored.nodeAlive, 'node-a')
      );
      expect(orsetContains(stateOriginal.nodeAlive, 'node-b')).toBe(
        orsetContains(stateRestored.nodeAlive, 'node-b')
      );
    });

    it('throws on null/undefined input', () => {
      expect(() => deserializeWormhole(null)).toThrow(WormholeError);
      expect(() => deserializeWormhole(null)).toThrow('expected object');
      expect(() => deserializeWormhole(undefined)).toThrow(WormholeError);
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
        const incomplete = { ...validBase };
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
  });

  describe('materialization equivalence', () => {
    it('wormhole + remaining patches produces same state as all patches', async () => {
      // Create 10 patches
      const patches = [];
      for (let i = 1; i <= 10; i++) {
        patches.push(createPatchV2({
          writer: 'alice',
          lamport: i,
          ops: [
            createNodeAddV2(`node-${i}`, createDot('alice', i)),
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
      const fullResult = reduceV5(allPatches);

      // Verify both produce same state
      for (let i = 1; i <= 10; i++) {
        expect(orsetContains(wormholeResult.nodeAlive, `node-${i}`)).toBe(
          orsetContains(fullResult.nodeAlive, `node-${i}`)
        );
        const propKey = encodePropKey(`node-${i}`, 'index');
        expect(lwwValue(wormholeResult.prop.get(propKey))).toEqual(
          lwwValue(fullResult.prop.get(propKey))
        );
      }
    });

    it('multiple wormholes produce same state as all patches', async () => {
      // Create 20 patches
      const patches = [];
      for (let i = 1; i <= 20; i++) {
        patches.push(createPatchV2({
          writer: 'alice',
          lamport: i,
          ops: [createNodeAddV2(`node-${i}`, createDot('alice', i))],
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
      const fullResult = reduceV5(allPatches);

      // Verify both produce same state
      for (let i = 1; i <= 20; i++) {
        expect(orsetContains(wormholeResult.nodeAlive, `node-${i}`)).toBe(
          orsetContains(fullResult.nodeAlive, `node-${i}`)
        );
      }
    });
  });

  describe('edge cases', () => {
    it('handles wormhole of single patch at start of chain', async () => {
      const patch1 = createPatchV2({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAddV2('root', createDot('alice', 1))],
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
      expect(orsetContains(state.nodeAlive, 'root')).toBe(true);
    });

    it('handles wormhole with complex operations', async () => {
      const patch1 = createPatchV2({
        writer: 'alice',
        lamport: 1,
        ops: [
          createNodeAddV2('a', createDot('alice', 1)),
          createNodeAddV2('b', createDot('alice', 2)),
          createEdgeAddV2('a', 'b', 'link1', createDot('alice', 3)),
          createEdgeAddV2('b', 'a', 'link2', createDot('alice', 4)),
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

      expect(orsetContains(state.nodeAlive, 'a')).toBe(true);
      expect(orsetContains(state.nodeAlive, 'b')).toBe(true);
      expect(orsetContains(state.edgeAlive, encodeEdgeKey('a', 'b', 'link1'))).toBe(true);
      expect(orsetContains(state.edgeAlive, encodeEdgeKey('b', 'a', 'link2'))).toBe(true);
      expect(lwwValue(state.prop.get(encodePropKey('a', 'x')))).toEqual(createInlineValue(1));
      expect(lwwValue(state.prop.get(encodePropKey('a', 'y')))).toEqual(createInlineValue(2));
      expect(lwwValue(state.prop.get(encodePropKey('b', 'z')))).toEqual(createInlineValue(3));
    });
  });
});
