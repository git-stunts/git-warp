/**
 * Edge-case tests for CheckpointService.
 *
 * Covers validation boundaries, schema mismatches, empty states,
 * and unusual but valid inputs that the main test file does not exercise.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  create as createCheckpoint,
  type CreateCheckpointOptions,
} from '../../../../src/domain/services/state/checkpointCreate.ts';
import {
  loadCheckpoint as loadCheckpointWithCodec,
  materializeIncremental as materializeIncrementalWithCodec,
  reconstructStateFromCheckpoint,
  type LoadCheckpointOptions,
  type LoadPersistence,
  type MaterializeIncrementalOptions,
} from '../../../../src/domain/services/state/checkpointLoad.ts';
import { CURRENT_CHECKPOINT_SCHEMA } from '../../../../src/domain/services/state/checkpointHelpers.ts';
import {
  createFrontier,
  updateFrontier,
  serializeFrontier,
} from '../../../../src/domain/services/Frontier.ts';
import {
  deserializeFullState,
  serializeCheckpointStateEnvelope,
  deserializeCheckpointStateEnvelope,
  computeAppliedVV,
  serializeAppliedVV,
} from '../../../../src/domain/services/state/CheckpointSerializer.ts';
import { computeStateHash } from '../../../../src/domain/services/state/StateSerializer.ts';
import {
  createEmptyState,
  encodeEdgeKey as encodeEdgeKeyV5,
  encodePropKey as encodePropKeyV5,
} from '../../../../src/domain/services/JoinReducer.ts';
import {
  DEFAULT_COMMIT_MESSAGE_CODEC,
  encodeCheckpointMessage,
  decodeCheckpointMessage,
} from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import { ProvenanceIndex } from '../../../../src/domain/services/provenance/ProvenanceIndex.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';

const crypto = new NodeCryptoAdapter();

type CreateCheckpointTestOptions =
  Omit<CreateCheckpointOptions, 'commitMessageCodec'> &
  Partial<Pick<CreateCheckpointOptions, 'commitMessageCodec'>>;

type LoadCheckpointTestOptions =
  Omit<LoadCheckpointOptions, 'commitMessageCodec'> &
  Partial<Pick<LoadCheckpointOptions, 'commitMessageCodec'>>;

type MaterializeIncrementalTestOptions =
  Omit<MaterializeIncrementalOptions, 'commitMessageCodec'> &
  Partial<Pick<MaterializeIncrementalOptions, 'commitMessageCodec'>>;

async function create(options: CreateCheckpointTestOptions): ReturnType<typeof createCheckpoint> {
  return await createCheckpoint({
    ...options,
    commitMessageCodec: options.commitMessageCodec ?? DEFAULT_COMMIT_MESSAGE_CODEC,
  });
}

async function loadCheckpoint(
  persistence: LoadPersistence,
  checkpointSha: string,
  options: LoadCheckpointTestOptions = {},
): ReturnType<typeof loadCheckpointWithCodec> {
  return await loadCheckpointWithCodec(persistence, checkpointSha, {
    ...options,
    commitMessageCodec: options.commitMessageCodec ?? DEFAULT_COMMIT_MESSAGE_CODEC,
  });
}

async function materializeIncremental(
  options: MaterializeIncrementalTestOptions,
): ReturnType<typeof materializeIncrementalWithCodec> {
  return await materializeIncrementalWithCodec({
    ...options,
    commitMessageCodec: options.commitMessageCodec ?? DEFAULT_COMMIT_MESSAGE_CODEC,
  });
}

/** Creates a valid 40-char hex OID for testing. */
const makeOid = (prefix) => {
  const base = prefix.replace(/[^0-9a-f]/gi, '0').toLowerCase();
  return (base + '0'.repeat(40)).slice(0, 40);
};

function installSchema5CheckpointRead({
  mockPersistence,
  state,
  frontier,
  stateHash,
  appliedVV = computeAppliedVV(state),
  provenanceIndex = undefined,
  includeAppliedVV = true,
  indexShardOids = {},
}: {
  mockPersistence: any;
  state: ReturnType<typeof createEmptyState>;
  frontier: Map<string, string>;
  stateHash: string;
  appliedVV?: ReturnType<typeof computeAppliedVV>;
  provenanceIndex?: ProvenanceIndex;
  includeAppliedVV?: boolean;
  indexShardOids?: Record<string, string>;
}) {
  const frontierOid = makeOid('frontier');
  const appliedVVOid = makeOid('appliedvv');
  const stateEnvelope = serializeCheckpointStateEnvelope(state);
  const blobMap = new Map([
    [makeOid('nodealive'), stateEnvelope.nodeAlive],
    [makeOid('edgealive'), stateEnvelope.edgeAlive],
    [makeOid('prop'), stateEnvelope.prop],
    [makeOid('observed'), stateEnvelope.observedFrontier],
    [makeOid('edgebirth'), stateEnvelope.edgeBirthEvent],
    [frontierOid, serializeFrontier(frontier)],
  ]);
  if (includeAppliedVV) {
    blobMap.set(appliedVVOid, serializeAppliedVV(appliedVV));
  }
  if (provenanceIndex !== undefined) {
    blobMap.set(makeOid('provenance'), provenanceIndex.serialize());
  }

  mockPersistence.showNode.mockResolvedValue(encodeCheckpointMessage({
    graph: 'test',
    stateHash,
    frontierOid,
    indexOid: makeOid('envelope'),
    schema: 5,
  }));
  mockPersistence.getNodeInfo.mockResolvedValue({ sha: makeOid('checkpoint') });
  mockPersistence.readTreeOids.mockResolvedValue({
    'state': makeOid('state-tree'),
    'state/nodeAlive': makeOid('nodealive'),
    'state/edgeAlive': makeOid('edgealive'),
    'state/prop.cbor': makeOid('prop'),
    'state/observedFrontier.cbor': makeOid('observed'),
    'state/edgeBirthEvent.cbor': makeOid('edgebirth'),
    'frontier.cbor': frontierOid,
    ...(includeAppliedVV ? { 'appliedVV.cbor': appliedVVOid } : {}),
    ...(provenanceIndex !== undefined ? { 'provenanceIndex.cbor': makeOid('provenance') } : {}),
    ...indexShardOids,
  });
  mockPersistence.readBlob.mockImplementation((oid) => {
    const blob = blobMap.get(oid);
    if (blob !== undefined) {
      return Promise.resolve(blob);
    }
    throw new Error(`Unknown oid: ${oid}`);
  });
}

function envelopeFromCreateBlobs(blobs: Uint8Array[]) {
  return deserializeCheckpointStateEnvelope({
    nodeAlive: requireBlobAt(blobs, 0),
    edgeAlive: requireBlobAt(blobs, 1),
    prop: requireBlobAt(blobs, 2),
    observedFrontier: requireBlobAt(blobs, 3),
    edgeBirthEvent: requireBlobAt(blobs, 4),
  });
}

function requireBlobAt(blobs: Uint8Array[], index: number): Uint8Array {
  const blob = blobs[index];
  if (blob === undefined) {
    throw new Error(`Missing checkpoint envelope blob at index ${index}`);
  }
  return blob;
}

function splitTreeEntry(entry: string): { oid: string; path: string } {
  const [left, path] = entry.split('\t');
  if (left === undefined || path === undefined) {
    throw new Error(`Invalid tree entry: ${entry}`);
  }
  const oid = left.split(' ')[2];
  if (oid === undefined) {
    throw new Error(`Invalid tree oid entry: ${entry}`);
  }
  return { oid, path };
}

describe('CheckpointService edge cases', () => {
    let mockPersistence: any;

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
    it('rejects schema:2 with migration error in shipped runtime', async () => {
      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash: 'a'.repeat(64),
        frontierOid: 'a'.repeat(40),
        indexOid: 'b'.repeat(40),
        schema: 2,
      });

      mockPersistence.showNode.mockResolvedValue(message);

      await expect(
        loadCheckpoint(mockPersistence, makeOid('legacy2'))
      ).rejects.toThrow(/schema:2/i);
      expect(mockPersistence.readTreeOids).not.toHaveBeenCalled();
    });

    it('rejects schema:3 with migration error in shipped runtime', async () => {
      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash: 'a'.repeat(64),
        frontierOid: 'a'.repeat(40),
        indexOid: 'b'.repeat(40),
        schema: 3,
      });

      mockPersistence.showNode.mockResolvedValue(message);

      await expect(
        loadCheckpoint(mockPersistence, makeOid('legacy3'))
      ).rejects.toThrow(/schema:3/i);
      expect(mockPersistence.readTreeOids).not.toHaveBeenCalled();
    });

    it('rejects schema:4 with migration error in shipped runtime', async () => {
      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash: 'a'.repeat(64),
        frontierOid: 'a'.repeat(40),
        indexOid: 'b'.repeat(40),
        schema: 4,
      });

      mockPersistence.showNode.mockResolvedValue(message);

      await expect(
        loadCheckpoint(mockPersistence, makeOid('legacy4'))
      ).rejects.toThrow(/schema:4/i);
      expect(mockPersistence.readTreeOids).not.toHaveBeenCalled();
    });

    it('loads schema:5 checkpoint envelopes', async () => {
      const state = createEmptyState();
      state.nodeAlive.add('current', Dot.create('w1', 1));
      const frontier = createFrontier();
      updateFrontier(frontier, 'w1', makeOid('sha1'));
      const stateHash = await computeStateHash(state, { crypto });

      installSchema5CheckpointRead({
        mockPersistence,
        state,
        frontier,
        stateHash,
      });

      const result = await loadCheckpoint(mockPersistence, makeOid('current'));
      expect(result.schema).toBe(5);
      expect(result.state.nodeAlive.contains('current')).toBe(true);
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

    it('rejects schema:3 before reading legacy state blobs', async () => {
      const state = createEmptyState();
      const dot = Dot.create('w1', 1);
      state.nodeAlive.add('x', dot);
      const stateHash = await computeStateHash(state, { crypto });

      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash,
        frontierOid: makeOid('frontier'),
        indexOid: makeOid('tree'),
        schema: 3,
      });

      mockPersistence.showNode.mockResolvedValue(message);

      await expect(loadCheckpoint(
        mockPersistence,
        makeOid('checkpoint')
      )).rejects.toThrow(/schema:3/i);
      expect(mockPersistence.readTreeOids).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Empty state checkpoint
  // --------------------------------------------------------------------------

  describe('empty state checkpoint', () => {
    it('roundtrips an empty state through create and load', async () => {
      const state = createEmptyState();
      const frontier = createFrontier();

      const writtenBlobs = new Map();
      let writtenMessage: any;
      let stateTreeEntries: string[] = [];
      let envelopeTreeEntries: string[] = [];
      let blobIndex = 0;

      mockPersistence.writeBlob.mockImplementation(
        (buffer) => {
          const oid = makeOid(`blob${blobIndex++}`);
          writtenBlobs.set(oid, buffer);
          return Promise.resolve(oid);
        }
      );
      mockPersistence.writeTree
        .mockImplementationOnce((entries) => {
          stateTreeEntries = entries;
          return Promise.resolve(makeOid('state-tree'));
        })
        .mockImplementationOnce((entries) => {
          envelopeTreeEntries = entries;
          return Promise.resolve(makeOid('envelope'));
        });
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
      const treeOids: Record<string, string> = {};
      for (const entry of stateTreeEntries) {
        const { oid, path } = splitTreeEntry(entry);
        treeOids[`state/${path}`] = oid;
      }
      for (const entry of envelopeTreeEntries) {
        const { oid, path } = splitTreeEntry(entry);
        if (path !== 'state') {
          treeOids[path] = oid;
        }
      }
      mockPersistence.readTreeOids.mockResolvedValue(treeOids);
      mockPersistence.readBlob.mockImplementation((oid) => {
        const blob = writtenBlobs.get(oid);
        if (blob !== undefined) {
          return Promise.resolve(blob);
        }
        throw new Error(`Unknown oid: ${oid}`);
      });

      const loaded = await loadCheckpoint(
        mockPersistence,
        makeOid('checkpoint')
      );

      expect(loaded.schema).toBe(CURRENT_CHECKPOINT_SCHEMA);
      expect(loaded.state.nodeAlive.elements()).toHaveLength(0);
      expect(loaded.state.edgeAlive.elements()).toHaveLength(0);
      expect(loaded.state.propSize()).toBe(0);
      expect(loaded.frontier.size).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // deserializeFullState edge cases
  // --------------------------------------------------------------------------

  describe('deserializeFullState edge cases', () => {
    it('throws for null buffer', () => {
      expect(() => deserializeFullState(null as never))
        .toThrow('Checkpoint state buffer is missing');
    });

    it('throws for undefined buffer', () => {
      expect(() => deserializeFullState(undefined as never))
        .toThrow('Checkpoint state buffer is missing');
    });

    it('throws for wrong version string', () => {
      // Encode a CBOR object with an unexpected version
      const defaultCodecImport = import(
        '../../../../src/domain/utils/defaultCodec.ts'
      );
      return defaultCodecImport.then(({ default: codec }) => {
        const buf = codec.encode({ version: 'full-v99', nodeAlive: {} });
        expect(() => deserializeFullState(buf)).toThrow(
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
      state.nodeAlive.add('a', Dot.create('w1', 1));

      const frontier = createFrontier();
      const stateHash = await computeStateHash(state, { crypto });

      installSchema5CheckpointRead({
        mockPersistence,
        state,
        frontier,
        stateHash,
        includeAppliedVV: false,
      });

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
      const dot = Dot.create('w1', 1);
      state.nodeAlive.add('x', dot);

      const frontier = createFrontier();
      updateFrontier(frontier, 'w1', makeOid('sha1'));

      const stateHash = await computeStateHash(state, { crypto });

      installSchema5CheckpointRead({
        mockPersistence,
        state,
        frontier,
        stateHash,
      });

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
      state.nodeAlive.add('y', Dot.create('w1', 1));

      const frontier = createFrontier();
      updateFrontier(frontier, 'w1', makeOid('sha1'));

      const stateHash = await computeStateHash(state, { crypto });

      installSchema5CheckpointRead({
        mockPersistence,
        state,
        frontier,
        stateHash,
      });

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
      state.nodeAlive.add('base', Dot.create('w1', 1));

      const checkpointFrontier = createFrontier();
      updateFrontier(checkpointFrontier, 'w1', makeOid('sha1'));

      const targetFrontier = createFrontier();
      updateFrontier(targetFrontier, 'w1', makeOid('sha1'));
      updateFrontier(targetFrontier, 'w2', makeOid('sha2'));

      const stateHash = await computeStateHash(state, { crypto });

      installSchema5CheckpointRead({
        mockPersistence,
        state,
        frontier: checkpointFrontier,
        stateHash,
      });

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
                dot: Dot.create('w2', 1),
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
        patchLoader: (patchLoader as any),
      });

      expect(result.nodeAlive.contains('base')).toBe(true);
      expect(result.nodeAlive.contains('new-node')).toBe(true);
      expect(patchLoader).toHaveBeenCalledWith('w1', makeOid('sha1'), makeOid('sha1'));
      expect(patchLoader).toHaveBeenCalledWith('w2', null, makeOid('sha2'));
    });
  });

  // --------------------------------------------------------------------------
  // reconstructStateFromCheckpoint edge cases
  // --------------------------------------------------------------------------

  describe('reconstructStateFromCheckpoint edge cases', () => {
    it('handles nodes with no edges', () => {
      const state = reconstructStateFromCheckpoint({
        nodes: ['isolated1', 'isolated2'],
        edges: [],
        props: [],
      });

      expect(state.nodeAlive.contains('isolated1')).toBe(true);
      expect(state.nodeAlive.contains('isolated2')).toBe(true);
      expect(state.edgeAlive.elements()).toHaveLength(0);
    });

    it('handles nodes with properties but no edges', () => {
      const state = reconstructStateFromCheckpoint({
        nodes: ['solo'],
        edges: [],
        props: [{ node: 'solo', key: 'name', value: 'alone' }],
      });

      expect(state.nodeAlive.contains('solo')).toBe(true);
      const propKey = encodePropKeyV5('solo', 'name');
      expect(state.hasProp(propKey)).toBe(true);
      expect((state.getEncodedProp(propKey as any))!.value).toBe('alone');
    });

    it('uses synthetic dot for all elements (shared identity)', () => {
      const state = reconstructStateFromCheckpoint({
        nodes: ['a', 'b'],
        edges: [{ from: 'a', to: 'b', label: 'link' }],
        props: [],
      });

      // Both nodes should share the same synthetic dot (__checkpoint__:1)
      const dotsA = state.nodeAlive.entries.get('a');
      const dotsB = state.nodeAlive.entries.get('b');
      expect(dotsA).toBeDefined();
      expect(dotsB).toBeDefined();
      expect([...(dotsA as Set<string>)]).toEqual([
        '__checkpoint__:1',
      ]);
      expect([...(dotsB as Set<string>)]).toEqual([
        '__checkpoint__:1',
      ]);
    });

    it('initializes edgeBirthEvent for reconstructed edges', () => {
      const state = reconstructStateFromCheckpoint({
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
    it('CURRENT_CHECKPOINT_SCHEMA is the current schema', () => {
      expect(CURRENT_CHECKPOINT_SCHEMA).toBe(5);
    });
  });

  // --------------------------------------------------------------------------
  // Compaction with empty state
  // --------------------------------------------------------------------------

  describe('compaction with empty state', () => {
    it('compaction on empty state is a no-op', async () => {
      const state = createEmptyState();
      const frontier = createFrontier();

      const stateEnvelopeBlobs: Uint8Array[] = [];
      mockPersistence.writeBlob.mockImplementation(
        (buffer) => {
          if (stateEnvelopeBlobs.length < 5) {
            stateEnvelopeBlobs.push(buffer);
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

      const restored = envelopeFromCreateBlobs(stateEnvelopeBlobs);
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
      const dot1 = Dot.create('w1', 1);
      const dot2 = Dot.create('w1', 2);
      state.nodeAlive.add('gone1', dot1);
      state.nodeAlive.add('gone2', dot2);
      state.nodeAlive.remove(new Set([encodeDot(dot1)]));
      state.nodeAlive.remove(new Set([encodeDot(dot2)]));

      const frontier = createFrontier();
      updateFrontier(frontier, 'w1', makeOid('sha1'));

      const stateEnvelopeBlobs: Uint8Array[] = [];
      mockPersistence.writeBlob.mockImplementation(
        (buffer) => {
          if (stateEnvelopeBlobs.length < 5) {
            stateEnvelopeBlobs.push(buffer);
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

      const restored = envelopeFromCreateBlobs(stateEnvelopeBlobs);
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
    it('roundtrips schema:5 message correctly', () => {
      const message = encodeCheckpointMessage({
        graph: 'my-graph',
        stateHash: 'f'.repeat(64),
        frontierOid: 'a'.repeat(40),
        indexOid: 'b'.repeat(40),
        schema: 5,
      });

      const decoded = decodeCheckpointMessage(message);
      expect(decoded.kind).toBe('checkpoint');
      expect(decoded.graph).toBe('my-graph');
      expect(decoded.schema).toBe(CURRENT_CHECKPOINT_SCHEMA);
      expect(decoded.checkpointVersion).toBe('v5');
    });

    it('preserves stateHash through encode/decode', () => {
      const hash = 'abcdef0123456789'.repeat(4);
      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash: hash,
        frontierOid: 'a'.repeat(40),
        indexOid: 'b'.repeat(40),
        schema: 5,
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
      state.nodeAlive.add('a', Dot.create('w1', 1));

      const frontier = createFrontier();
      const stateHash = await computeStateHash(state, { crypto });

      installSchema5CheckpointRead({
        mockPersistence,
        state,
        frontier,
        stateHash,
      });

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
      state.nodeAlive.add('a', Dot.create('w1', 1));

      const provenanceIndex = new ProvenanceIndex();
      provenanceIndex.addPatch(makeOid('patch1'), ['a'], ['a']);

      const frontier = createFrontier();
      const stateHash = await computeStateHash(state, { crypto });

      installSchema5CheckpointRead({
        mockPersistence,
        state,
        frontier,
        stateHash,
        provenanceIndex,
      });

      const result = await loadCheckpoint(
        mockPersistence,
        makeOid('checkpoint')
      );

      expect(result.provenanceIndex).toBeDefined();
      expect(result.provenanceIndex?.patchesFor('a')).toEqual([makeOid('patch1')]);
    });
  });

  describe('createCheckpointEnvelope with checkpointStore and provenance index', () => {
    it('uses schema:5 envelope writes when checkpointStore is provided', async () => {
      const state = createEmptyState();
      state.nodeAlive.add('n', Dot.create('w1', 1));
      const frontier = createFrontier();
      const checkpointStore = {
        writeCheckpoint: vi.fn(async () => ({
          stateBlobOid: makeOid('state'),
          frontierBlobOid: makeOid('frontier'),
          appliedVVBlobOid: makeOid('appliedvv'),
          provenanceIndexBlobOid: null,
        })),
      };

      let blobIndex = 0;
      mockPersistence.writeBlob.mockImplementation(() => Promise.resolve(makeOid(`blob${blobIndex++}`)));
      mockPersistence.writeTree
        .mockResolvedValueOnce(makeOid('state-tree'))
        .mockResolvedValueOnce(makeOid('envelope'));
      mockPersistence.commitNodeWithTree.mockResolvedValue(makeOid('checkpoint'));

      await create({
        persistence: mockPersistence,
        graphName: 'test',
        state,
        frontier,
        checkpointStore: (checkpointStore as any),
        crypto,
      });

      expect(checkpointStore.writeCheckpoint).not.toHaveBeenCalled();
      expect(mockPersistence.writeBlob).toHaveBeenCalledTimes(7);
      const message = mockPersistence.commitNodeWithTree.mock.calls[0][0].message;
      expect(decodeCheckpointMessage(message).schema).toBe(5);
    });

    it('writes provenanceIndex blob in the schema:5 envelope path', async () => {
      const state = createEmptyState();
      state.nodeAlive.add('n', Dot.create('w1', 1));
      const frontier = createFrontier();
      const provenanceIndex = new ProvenanceIndex();
      provenanceIndex.addPatch(makeOid('patch1'), ['n'], ['n']);

      let blobIndex = 0;
      const blobOids = [
        makeOid('nodealive'),
        makeOid('edgealive'),
        makeOid('prop'),
        makeOid('observed'),
        makeOid('edgebirth'),
        makeOid('frontier'),
        makeOid('appliedvv'),
        makeOid('prov'),
      ];
      mockPersistence.writeBlob.mockImplementation(() => Promise.resolve(blobOids[blobIndex++]));
      mockPersistence.writeTree
        .mockResolvedValueOnce(makeOid('state-tree'))
        .mockResolvedValueOnce(makeOid('envelope'));
      mockPersistence.commitNodeWithTree.mockResolvedValue(makeOid('checkpoint'));

      await create({
        persistence: mockPersistence,
        graphName: 'test',
        state,
        frontier,
        provenanceIndex,
        crypto,
      });

      expect(mockPersistence.writeBlob).toHaveBeenCalledTimes(8);
      const treeEntries = mockPersistence.writeTree.mock.calls[1][0];
      expect(treeEntries).toContain(`100644 blob ${makeOid('prov')}\tprovenanceIndex.cbor`);
    });
  });
});
