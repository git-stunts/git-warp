/**
 * Edge-case tests for CheckpointService.
 *
 * Covers validation boundaries, schema mismatches, empty states,
 * and unusual but valid inputs that the main test file does not exercise.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  create,
  loadCheckpoint,
  materializeIncremental,
  reconstructStateV5FromCheckpoint,
  CHECKPOINT_SCHEMA_STANDARD,
  CHECKPOINT_SCHEMA_INDEX_TREE,
} from '../../../../src/domain/services/state/CheckpointService.js';
import {
  createFrontier,
  updateFrontier,
  serializeFrontier,
} from '../../../../src/domain/services/Frontier.js';
import {
  serializeFullStateV5,
  deserializeFullStateV5,
  computeAppliedVV,
  serializeAppliedVV,
} from '../../../../src/domain/services/state/CheckpointSerializerV5.js';
import { computeStateHashV5 } from '../../../../src/domain/services/state/StateSerializerV5.js';
import {
  createEmptyState,
  encodeEdgeKey as encodeEdgeKeyV5,
  encodePropKey as encodePropKeyV5,
} from '../../../../src/domain/services/JoinReducer.ts';
import {
  encodeCheckpointMessage,
  decodeCheckpointMessage,
} from '../../../../src/domain/services/codec/WarpMessageCodec.js';
import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import { createDot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import { ProvenanceIndex } from '../../../../src/domain/services/provenance/ProvenanceIndex.js';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.js';

const crypto = new NodeCryptoAdapter();

/** Creates a valid 40-char hex OID for testing. */
const makeOid = (/** @type {string} */ prefix) => {
  const base = prefix.replace(/[^0-9a-f]/gi, '0').toLowerCase();
  return (base + '0'.repeat(40)).slice(0, 40);
};

describe('CheckpointService edge cases', () => {
  /** @type {any} */
  let mockPersistence;

  beforeEach(() => {
    mockPersistence = {
      writeBlob: vi.fn(),
      writeTree: vi.fn(),
      readBlob: vi.fn(),
      readTreeOids: vi.fn(),
      commitNodeWithTree: vi.fn(),
      showNode: vi.fn(),
      getNodeInfo: vi.fn(),
    };
  });

  // --------------------------------------------------------------------------
  // Schema version validation
  // --------------------------------------------------------------------------

  describe('unsupported schema versions', () => {
    it('rejects schema:5 with migration error', async () => {
      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash: 'a'.repeat(64),
        frontierOid: 'a'.repeat(40),
        indexOid: 'b'.repeat(40),
        schema: 5,
      });

      mockPersistence.showNode.mockResolvedValue(message);

      await expect(
        loadCheckpoint(mockPersistence, makeOid('badschema'))
      ).rejects.toThrow(/schema:5/);
    });

    it('rejects schema:99 with migration error', async () => {
      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash: 'a'.repeat(64),
        frontierOid: 'a'.repeat(40),
        indexOid: 'b'.repeat(40),
        schema: 99,
      });

      mockPersistence.showNode.mockResolvedValue(message);

      await expect(
        loadCheckpoint(mockPersistence, makeOid('futureschema'))
      ).rejects.toThrow(/schema:99/);
    });

    it('accepts schema:3 checkpoints', async () => {
      const state = createEmptyState();
      const dot = createDot('w1', 1);
      state.nodeAlive.add('x', dot);

      const frontier = createFrontier();
      updateFrontier(frontier, 'w1', makeOid('sha1'));

      const stateBuffer = serializeFullStateV5(state);
      const frontierBuffer = serializeFrontier(frontier);
      const appliedVVBuffer = serializeAppliedVV(computeAppliedVV(state));
      const stateHash = await computeStateHashV5(state, { crypto });

      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash,
        frontierOid: makeOid('frontier'),
        indexOid: makeOid('tree'),
        schema: 3,
      });

      mockPersistence.showNode.mockResolvedValue(message);
      mockPersistence.readTreeOids.mockResolvedValue({
        'state.cbor': makeOid('state'),
        'frontier.cbor': makeOid('frontier'),
        'appliedVV.cbor': makeOid('appliedvv'),
      });
      mockPersistence.readBlob.mockImplementation(
        (/** @type {string} */ oid) => {
          if (oid === makeOid('state')) {
            return Promise.resolve(stateBuffer);
          }
          if (oid === makeOid('frontier')) {
            return Promise.resolve(frontierBuffer);
          }
          if (oid === makeOid('appliedvv')) {
            return Promise.resolve(appliedVVBuffer);
          }
          throw new Error(`Unknown oid: ${oid}`);
        }
      );

      const result = await loadCheckpoint(
        mockPersistence,
        makeOid('checkpoint')
      );
      expect(result.schema).toBe(3);
      expect(result.state.nodeAlive.entries.has('x')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Empty state checkpoint
  // --------------------------------------------------------------------------

  describe('empty state checkpoint', () => {
    it('roundtrips an empty state through create and load', async () => {
      const state = createEmptyState();
      const frontier = createFrontier();

      // Capture written blobs
      /** @type {any[]} */
      const writtenBlobs = [];
      /** @type {any} */
      let writtenMessage;

      mockPersistence.writeBlob.mockImplementation(
        (/** @type {any} */ buffer) => {
          writtenBlobs.push(buffer);
          const names = ['state', 'frontier', 'appliedvv'];
          return Promise.resolve(makeOid(names[writtenBlobs.length - 1] ?? 'blob'));
        }
      );
      mockPersistence.writeTree.mockResolvedValue(makeOid('tree'));
      mockPersistence.commitNodeWithTree.mockImplementation(
        (/** @type {any} */ { message }) => {
          writtenMessage = message;
          return Promise.resolve(makeOid('checkpoint'));
        }
      );

      await create({
        persistence: mockPersistence,
        graphName: 'empty-graph',
        state,
        frontier,
        crypto,
      });

      // Setup load mocks
      mockPersistence.showNode.mockResolvedValue(writtenMessage);
      mockPersistence.readTreeOids.mockResolvedValue({
        'state.cbor': makeOid('state'),
        'frontier.cbor': makeOid('frontier'),
        'appliedVV.cbor': makeOid('appliedvv'),
      });
      mockPersistence.readBlob.mockImplementation(
        (/** @type {string} */ oid) => {
          if (oid === makeOid('state')) {
            return Promise.resolve(writtenBlobs[0]);
          }
          if (oid === makeOid('frontier')) {
            return Promise.resolve(writtenBlobs[1]);
          }
          if (oid === makeOid('appliedvv')) {
            return Promise.resolve(writtenBlobs[2]);
          }
          throw new Error(`Unknown oid: ${oid}`);
        }
      );

      const loaded = await loadCheckpoint(
        mockPersistence,
        makeOid('checkpoint')
      );

      expect(loaded.schema).toBe(CHECKPOINT_SCHEMA_STANDARD);
      expect(loaded.state.nodeAlive.elements()).toHaveLength(0);
      expect(loaded.state.edgeAlive.elements()).toHaveLength(0);
      expect(loaded.state.prop.size).toBe(0);
      expect(loaded.frontier.size).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // deserializeFullStateV5 edge cases
  // --------------------------------------------------------------------------

  describe('deserializeFullStateV5 edge cases', () => {
    it('returns empty state for null buffer', () => {
      const state = deserializeFullStateV5(/** @type {any} */ (null));
      expect(state.nodeAlive.elements()).toHaveLength(0);
      expect(state.edgeAlive.elements()).toHaveLength(0);
      expect(state.prop.size).toBe(0);
    });

    it('returns empty state for undefined buffer', () => {
      const state = deserializeFullStateV5(/** @type {any} */ (undefined));
      expect(state.nodeAlive.elements()).toHaveLength(0);
    });

    it('throws for wrong version string', () => {
      // Encode a CBOR object with an unexpected version
      const defaultCodecImport = import(
        '../../../../src/domain/utils/defaultCodec.ts'
      );
      return defaultCodecImport.then(({ default: codec }) => {
        const buf = codec.encode({ version: 'full-v99', nodeAlive: {} });
        expect(() => deserializeFullStateV5(buf)).toThrow(
          /Unsupported full state version.*full-v99/
        );
      });
    });
  });

  // --------------------------------------------------------------------------
  // Missing appliedVV.cbor (backward compatibility)
  // --------------------------------------------------------------------------

  describe('missing appliedVV.cbor', () => {
    it('returns null appliedVV when blob is absent', async () => {
      const state = createEmptyState();
      state.nodeAlive.add('a', createDot('w1', 1));

      const stateBuffer = serializeFullStateV5(state);
      const frontierBuffer = serializeFrontier(createFrontier());
      const stateHash = await computeStateHashV5(state, { crypto });

      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash,
        frontierOid: makeOid('frontier'),
        indexOid: makeOid('tree'),
        schema: 2,
      });

      mockPersistence.showNode.mockResolvedValue(message);
      mockPersistence.readTreeOids.mockResolvedValue({
        'state.cbor': makeOid('state'),
        'frontier.cbor': makeOid('frontier'),
        // No appliedVV.cbor
      });
      mockPersistence.readBlob.mockImplementation(
        (/** @type {string} */ oid) => {
          if (oid === makeOid('state')) {
            return Promise.resolve(stateBuffer);
          }
          if (oid === makeOid('frontier')) {
            return Promise.resolve(frontierBuffer);
          }
          throw new Error(`Unknown oid: ${oid}`);
        }
      );

      const result = await loadCheckpoint(
        mockPersistence,
        makeOid('checkpoint')
      );
      expect(result.appliedVV).toBeNull();
      expect(result.state.nodeAlive.entries.has('a')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // materializeIncremental edge cases
  // --------------------------------------------------------------------------

  describe('materializeIncremental edge cases', () => {
    it('returns checkpoint state when target frontier matches checkpoint', async () => {
      const state = createEmptyState();
      const dot = createDot('w1', 1);
      state.nodeAlive.add('x', dot);

      const frontier = createFrontier();
      updateFrontier(frontier, 'w1', makeOid('sha1'));

      const stateBuffer = serializeFullStateV5(state);
      const frontierBuffer = serializeFrontier(frontier);
      const appliedVVBuffer = serializeAppliedVV(computeAppliedVV(state));
      const stateHash = await computeStateHashV5(state, { crypto });

      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash,
        frontierOid: makeOid('frontier'),
        indexOid: makeOid('tree'),
        schema: 2,
      });

      mockPersistence.showNode.mockResolvedValue(message);
      mockPersistence.readTreeOids.mockResolvedValue({
        'state.cbor': makeOid('state'),
        'frontier.cbor': makeOid('frontier'),
        'appliedVV.cbor': makeOid('appliedvv'),
      });
      mockPersistence.readBlob.mockImplementation(
        (/** @type {string} */ oid) => {
          if (oid === makeOid('state')) {
            return Promise.resolve(stateBuffer);
          }
          if (oid === makeOid('frontier')) {
            return Promise.resolve(frontierBuffer);
          }
          if (oid === makeOid('appliedvv')) {
            return Promise.resolve(appliedVVBuffer);
          }
          throw new Error(`Unknown oid: ${oid}`);
        }
      );

      // patchLoader returns empty — no new patches since checkpoint
      const patchLoader = vi.fn().mockResolvedValue([]);

      const result = await materializeIncremental({
        persistence: mockPersistence,
        graphName: 'test',
        checkpointSha: makeOid('checkpoint'),
        targetFrontier: frontier,
        patchLoader,
      });

      // Should return the checkpoint state unchanged
      expect(result.nodeAlive.contains('x')).toBe(true);
      expect(patchLoader).toHaveBeenCalledTimes(1);
    });

    it('returns checkpoint state when target frontier is empty', async () => {
      const state = createEmptyState();
      state.nodeAlive.add('y', createDot('w1', 1));

      const frontier = createFrontier();
      updateFrontier(frontier, 'w1', makeOid('sha1'));

      const stateBuffer = serializeFullStateV5(state);
      const frontierBuffer = serializeFrontier(frontier);
      const appliedVVBuffer = serializeAppliedVV(computeAppliedVV(state));
      const stateHash = await computeStateHashV5(state, { crypto });

      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash,
        frontierOid: makeOid('frontier'),
        indexOid: makeOid('tree'),
        schema: 2,
      });

      mockPersistence.showNode.mockResolvedValue(message);
      mockPersistence.readTreeOids.mockResolvedValue({
        'state.cbor': makeOid('state'),
        'frontier.cbor': makeOid('frontier'),
        'appliedVV.cbor': makeOid('appliedvv'),
      });
      mockPersistence.readBlob.mockImplementation(
        (/** @type {string} */ oid) => {
          if (oid === makeOid('state')) {
            return Promise.resolve(stateBuffer);
          }
          if (oid === makeOid('frontier')) {
            return Promise.resolve(frontierBuffer);
          }
          if (oid === makeOid('appliedvv')) {
            return Promise.resolve(appliedVVBuffer);
          }
          throw new Error(`Unknown oid: ${oid}`);
        }
      );

      // Empty target frontier — no writers to catch up on
      const emptyTargetFrontier = createFrontier();

      const result = await materializeIncremental({
        persistence: mockPersistence,
        graphName: 'test',
        checkpointSha: makeOid('checkpoint'),
        targetFrontier: emptyTargetFrontier,
        patchLoader: vi.fn(),
      });

      // No patches loaded, returns checkpoint state as-is
      expect(result.nodeAlive.contains('y')).toBe(true);
    });

    it('applies newly loaded patches on top of checkpoint state', async () => {
      const state = createEmptyState();
      state.nodeAlive.add('base', createDot('w1', 1));

      const checkpointFrontier = createFrontier();
      updateFrontier(checkpointFrontier, 'w1', makeOid('sha1'));

      const targetFrontier = createFrontier();
      updateFrontier(targetFrontier, 'w1', makeOid('sha1'));
      updateFrontier(targetFrontier, 'w2', makeOid('sha2'));

      const stateBuffer = serializeFullStateV5(state);
      const frontierBuffer = serializeFrontier(checkpointFrontier);
      const appliedVVBuffer = serializeAppliedVV(computeAppliedVV(state));
      const stateHash = await computeStateHashV5(state, { crypto });

      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash,
        frontierOid: makeOid('frontier'),
        indexOid: makeOid('tree'),
        schema: 2,
      });

      mockPersistence.showNode.mockResolvedValue(message);
      mockPersistence.readTreeOids.mockResolvedValue({
        'state.cbor': makeOid('state'),
        'frontier.cbor': makeOid('frontier'),
        'appliedVV.cbor': makeOid('appliedvv'),
      });
      mockPersistence.readBlob.mockImplementation(
        (/** @type {string} */ oid) => {
          if (oid === makeOid('state')) {
            return Promise.resolve(stateBuffer);
          }
          if (oid === makeOid('frontier')) {
            return Promise.resolve(frontierBuffer);
          }
          if (oid === makeOid('appliedvv')) {
            return Promise.resolve(appliedVVBuffer);
          }
          throw new Error(`Unknown oid: ${oid}`);
        }
      );

      const patchLoader = vi.fn(async () => [
        {
          sha: makeOid('patch'),
          patch: {
            writer: 'w2',
            lamport: 1,
            ops: [
              {
                type: 'NodeAdd',
                node: 'new-node',
                dot: createDot('w2', 1),
              },
            ],
          },
        },
      ]);

      const result = await materializeIncremental({
        persistence: mockPersistence,
        graphName: 'test',
        checkpointSha: makeOid('checkpoint'),
        targetFrontier,
        patchLoader,
      });

      expect(result.nodeAlive.contains('base')).toBe(true);
      expect(result.nodeAlive.contains('new-node')).toBe(true);
      expect(patchLoader).toHaveBeenCalledWith('w1', makeOid('sha1'), makeOid('sha1'));
      expect(patchLoader).toHaveBeenCalledWith('w2', null, makeOid('sha2'));
    });
  });

  // --------------------------------------------------------------------------
  // reconstructStateV5FromCheckpoint edge cases
  // --------------------------------------------------------------------------

  describe('reconstructStateV5FromCheckpoint edge cases', () => {
    it('handles nodes with no edges', () => {
      const state = reconstructStateV5FromCheckpoint({
        nodes: ['isolated1', 'isolated2'],
        edges: [],
        props: [],
      });

      expect(state.nodeAlive.contains('isolated1')).toBe(true);
      expect(state.nodeAlive.contains('isolated2')).toBe(true);
      expect(state.edgeAlive.elements()).toHaveLength(0);
    });

    it('handles nodes with properties but no edges', () => {
      const state = reconstructStateV5FromCheckpoint({
        nodes: ['solo'],
        edges: [],
        props: [{ node: 'solo', key: 'name', value: 'alone' }],
      });

      expect(state.nodeAlive.contains('solo')).toBe(true);
      const propKey = encodePropKeyV5('solo', 'name');
      expect(state.prop.has(propKey)).toBe(true);
      expect(/** @type {any} */ (state.prop.get(propKey)).value).toBe('alone');
    });

    it('uses synthetic dot for all elements (shared identity)', () => {
      const state = reconstructStateV5FromCheckpoint({
        nodes: ['a', 'b'],
        edges: [{ from: 'a', to: 'b', label: 'link' }],
        props: [],
      });

      // Both nodes should share the same synthetic dot (__checkpoint__:1)
      const dotsA = state.nodeAlive.entries.get('a');
      const dotsB = state.nodeAlive.entries.get('b');
      expect(dotsA).toBeDefined();
      expect(dotsB).toBeDefined();
      expect([.../** @type {Set<string>} */ (dotsA)]).toEqual([
        '__checkpoint__:1',
      ]);
      expect([.../** @type {Set<string>} */ (dotsB)]).toEqual([
        '__checkpoint__:1',
      ]);
    });

    it('initializes edgeBirthEvent for reconstructed edges', () => {
      const state = reconstructStateV5FromCheckpoint({
        nodes: ['x', 'y'],
        edges: [{ from: 'x', to: 'y', label: 'rel' }],
        props: [],
      });

      const edgeKey = encodeEdgeKeyV5('x', 'y', 'rel');
      expect(state.edgeBirthEvent.has(edgeKey)).toBe(true);
      const birthEvent = state.edgeBirthEvent.get(edgeKey);
      expect(birthEvent).toBeDefined();
      expect(birthEvent?.lamport).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Checkpoint schema constants
  // --------------------------------------------------------------------------

  describe('schema constants', () => {
    it('CHECKPOINT_SCHEMA_STANDARD is 2', () => {
      expect(CHECKPOINT_SCHEMA_STANDARD).toBe(2);
    });

    it('CHECKPOINT_SCHEMA_INDEX_TREE is 4', () => {
      expect(CHECKPOINT_SCHEMA_INDEX_TREE).toBe(4);
    });
  });

  // --------------------------------------------------------------------------
  // Compaction with empty state
  // --------------------------------------------------------------------------

  describe('compaction with empty state', () => {
    it('compaction on empty state is a no-op', async () => {
      const state = createEmptyState();
      const frontier = createFrontier();

      /** @type {any} */
      let capturedStateBuffer;
      mockPersistence.writeBlob.mockImplementation(
        (/** @type {any} */ buffer) => {
          if (!capturedStateBuffer) {
            capturedStateBuffer = buffer;
          }
          return Promise.resolve(makeOid('blob'));
        }
      );
      mockPersistence.writeTree.mockResolvedValue(makeOid('tree'));
      mockPersistence.commitNodeWithTree.mockResolvedValue(
        makeOid('checkpoint')
      );

      await create({
        persistence: mockPersistence,
        graphName: 'test',
        state,
        frontier,
        compact: true,
        crypto,
      });

      const restored = deserializeFullStateV5(capturedStateBuffer);
      expect(restored.nodeAlive.elements()).toHaveLength(0);
      expect(restored.edgeAlive.elements()).toHaveLength(0);
      expect(restored.nodeAlive.tombstones.size).toBe(0);
      expect(restored.edgeAlive.tombstones.size).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Checkpoint with tombstoned-only state (all nodes removed)
  // --------------------------------------------------------------------------

  describe('checkpoint with all-tombstoned state', () => {
    it('compacts a fully-tombstoned state to empty', async () => {
      const state = createEmptyState();
      const dot1 = createDot('w1', 1);
      const dot2 = createDot('w1', 2);
      state.nodeAlive.add('gone1', dot1);
      state.nodeAlive.add('gone2', dot2);
      state.nodeAlive.remove(new Set([encodeDot(dot1)]));
      state.nodeAlive.remove(new Set([encodeDot(dot2)]));

      const frontier = createFrontier();
      updateFrontier(frontier, 'w1', makeOid('sha1'));

      /** @type {any} */
      let capturedStateBuffer;
      mockPersistence.writeBlob.mockImplementation(
        (/** @type {any} */ buffer) => {
          if (!capturedStateBuffer) {
            capturedStateBuffer = buffer;
          }
          return Promise.resolve(makeOid('blob'));
        }
      );
      mockPersistence.writeTree.mockResolvedValue(makeOid('tree'));
      mockPersistence.commitNodeWithTree.mockResolvedValue(
        makeOid('checkpoint')
      );

      await create({
        persistence: mockPersistence,
        graphName: 'test',
        state,
        frontier,
        compact: true,
        crypto,
      });

      const restored = deserializeFullStateV5(capturedStateBuffer);
      // After compaction, all tombstoned entries should be removed
      expect(restored.nodeAlive.elements()).toHaveLength(0);
      expect(restored.nodeAlive.entries.size).toBe(0);
      expect(restored.nodeAlive.tombstones.size).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Checkpoint message decoding edge cases
  // --------------------------------------------------------------------------

  describe('checkpoint message encoding/decoding', () => {
    it('roundtrips schema:4 message correctly', () => {
      const message = encodeCheckpointMessage({
        graph: 'my-graph',
        stateHash: 'f'.repeat(64),
        frontierOid: 'a'.repeat(40),
        indexOid: 'b'.repeat(40),
        schema: 4,
      });

      const decoded = decodeCheckpointMessage(message);
      expect(decoded.kind).toBe('checkpoint');
      expect(decoded.graph).toBe('my-graph');
      expect(decoded.schema).toBe(CHECKPOINT_SCHEMA_INDEX_TREE);
      expect(decoded.checkpointVersion).toBe('v5');
    });

    it('preserves stateHash through encode/decode', () => {
      const hash = 'abcdef0123456789'.repeat(4);
      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash: hash,
        frontierOid: 'a'.repeat(40),
        indexOid: 'b'.repeat(40),
        schema: 2,
      });

      const decoded = decodeCheckpointMessage(message);
      expect(decoded.stateHash).toBe(hash);
    });
  });

  // --------------------------------------------------------------------------
  // Provenenance index loading (absent)
  // --------------------------------------------------------------------------

  describe('provenanceIndex absent', () => {
    it('returns undefined provenanceIndex when blob is absent', async () => {
      const state = createEmptyState();
      state.nodeAlive.add('a', createDot('w1', 1));

      const stateBuffer = serializeFullStateV5(state);
      const frontierBuffer = serializeFrontier(createFrontier());
      const appliedVVBuffer = serializeAppliedVV(computeAppliedVV(state));
      const stateHash = await computeStateHashV5(state, { crypto });

      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash,
        frontierOid: makeOid('frontier'),
        indexOid: makeOid('tree'),
        schema: 2,
      });

      mockPersistence.showNode.mockResolvedValue(message);
      mockPersistence.readTreeOids.mockResolvedValue({
        'state.cbor': makeOid('state'),
        'frontier.cbor': makeOid('frontier'),
        'appliedVV.cbor': makeOid('appliedvv'),
        // No provenanceIndex.cbor
      });
      mockPersistence.readBlob.mockImplementation(
        (/** @type {string} */ oid) => {
          if (oid === makeOid('state')) {
            return Promise.resolve(stateBuffer);
          }
          if (oid === makeOid('frontier')) {
            return Promise.resolve(frontierBuffer);
          }
          if (oid === makeOid('appliedvv')) {
            return Promise.resolve(appliedVVBuffer);
          }
          throw new Error(`Unknown oid: ${oid}`);
        }
      );

      const result = await loadCheckpoint(
        mockPersistence,
        makeOid('checkpoint')
      );
      expect(result.provenanceIndex).toBeUndefined();
    });
  });

  describe('provenanceIndex present', () => {
    it('loads provenanceIndex from checkpoint tree when blob is present', async () => {
      const state = createEmptyState();
      state.nodeAlive.add('a', createDot('w1', 1));

      const provenanceIndex = new ProvenanceIndex();
      provenanceIndex.addPatch(makeOid('patch1'), ['a'], ['a']);

      const stateBuffer = serializeFullStateV5(state);
      const frontierBuffer = serializeFrontier(createFrontier());
      const appliedVVBuffer = serializeAppliedVV(computeAppliedVV(state));
      const provenanceBuffer = provenanceIndex.serialize();
      const stateHash = await computeStateHashV5(state, { crypto });

      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash,
        frontierOid: makeOid('frontier'),
        indexOid: makeOid('tree'),
        schema: 2,
      });

      mockPersistence.showNode.mockResolvedValue(message);
      mockPersistence.readTreeOids.mockResolvedValue({
        'state.cbor': makeOid('state'),
        'frontier.cbor': makeOid('frontier'),
        'appliedVV.cbor': makeOid('appliedvv'),
        'provenanceIndex.cbor': makeOid('prov'),
      });
      mockPersistence.readBlob.mockImplementation(
        (/** @type {string} */ oid) => {
          if (oid === makeOid('state')) {
            return Promise.resolve(stateBuffer);
          }
          if (oid === makeOid('frontier')) {
            return Promise.resolve(frontierBuffer);
          }
          if (oid === makeOid('appliedvv')) {
            return Promise.resolve(appliedVVBuffer);
          }
          if (oid === makeOid('prov')) {
            return Promise.resolve(provenanceBuffer);
          }
          throw new Error(`Unknown oid: ${oid}`);
        }
      );

      const result = await loadCheckpoint(
        mockPersistence,
        makeOid('checkpoint')
      );

      expect(result.provenanceIndex).toBeDefined();
      expect(result.provenanceIndex?.patchesFor('a')).toEqual([makeOid('patch1')]);
    });
  });

  describe('createV5 with checkpointStore and provenance index', () => {
    it('computes stateHash for checkpointStore when no stateHashService is provided', async () => {
      const state = createEmptyState();
      state.nodeAlive.add('n', createDot('w1', 1));
      const frontier = createFrontier();
      const checkpointStore = {
        writeCheckpoint: vi.fn(async () => ({
          stateBlobOid: makeOid('state'),
          frontierBlobOid: makeOid('frontier'),
          appliedVVBlobOid: makeOid('appliedvv'),
          provenanceIndexBlobOid: null,
        })),
      };

      mockPersistence.writeTree.mockResolvedValue(makeOid('tree'));
      mockPersistence.commitNodeWithTree.mockResolvedValue(makeOid('checkpoint'));

      await create({
        persistence: mockPersistence,
        graphName: 'test',
        state,
        frontier,
        checkpointStore: /** @type {any} */ (checkpointStore),
        crypto,
      });

      expect(checkpointStore.writeCheckpoint).toHaveBeenCalledWith(expect.objectContaining({
        stateHash: await computeStateHashV5(state, { crypto }),
      }));
    });

    it('writes provenanceIndex blob in the legacy checkpoint path', async () => {
      const state = createEmptyState();
      state.nodeAlive.add('n', createDot('w1', 1));
      const frontier = createFrontier();
      const provenanceIndex = new ProvenanceIndex();
      provenanceIndex.addPatch(makeOid('patch1'), ['n'], ['n']);

      let blobIndex = 0;
      const blobOids = [makeOid('state'), makeOid('frontier'), makeOid('appliedvv'), makeOid('prov')];
      mockPersistence.writeBlob.mockImplementation(() => Promise.resolve(blobOids[blobIndex++]));
      mockPersistence.writeTree.mockResolvedValue(makeOid('tree'));
      mockPersistence.commitNodeWithTree.mockResolvedValue(makeOid('checkpoint'));

      await create({
        persistence: mockPersistence,
        graphName: 'test',
        state,
        frontier,
        provenanceIndex,
        crypto,
      });

      expect(mockPersistence.writeBlob).toHaveBeenCalledTimes(4);
      const treeEntries = mockPersistence.writeTree.mock.calls[0][0];
      expect(treeEntries).toContain(`100644 blob ${makeOid('prov')}\tprovenanceIndex.cbor`);
    });
  });
});
