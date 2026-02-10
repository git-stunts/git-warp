import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create, createV5, loadCheckpoint, materializeIncremental, reconstructStateV5FromCheckpoint } from '../../../../src/domain/services/CheckpointService.js';
import { createFrontier, updateFrontier, serializeFrontier, deserializeFrontier } from '../../../../src/domain/services/Frontier.js';
import { serializeStateV5, deserializeStateV5, computeStateHashV5 } from '../../../../src/domain/services/StateSerializerV5.js';
import {
  serializeFullStateV5,
  deserializeFullStateV5,
  computeAppliedVV,
  serializeAppliedVV,
  deserializeAppliedVV,
} from '../../../../src/domain/services/CheckpointSerializerV5.js';
import { createEmptyStateV5, encodeEdgeKey as encodeEdgeKeyV5, encodePropKey as encodePropKeyV5 } from '../../../../src/domain/services/JoinReducer.js';
import { encodeCheckpointMessage, decodeCheckpointMessage } from '../../../../src/domain/services/WarpMessageCodec.js';
import { orsetAdd, orsetRemove, orsetContains, orsetElements } from '../../../../src/domain/crdt/ORSet.js';
import { createDot, encodeDot } from '../../../../src/domain/crdt/Dot.js';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.js';

const crypto = new NodeCryptoAdapter();

// Helper to create valid 40-char hex OIDs for testing
const makeOid = (/** @type {string} */ prefix) => {
  const base = prefix.replace(/[^0-9a-f]/gi, '0').toLowerCase();
  return (base + '0'.repeat(40)).slice(0, 40);
};

describe('CheckpointService', () => {
  /** @type {any} */
  /** @type {any} */
  let mockPersistence;

  beforeEach(() => {
    // Create mock persistence adapter
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

  describe('create', () => {
    it('creates schema:2 checkpoint commit with state and frontier blobs', async () => {
      // Setup test data - V5 state (schema:2 only)
      const state = createEmptyStateV5();
      const dot = createDot('writer1', 1);
      orsetAdd(state.nodeAlive, 'x', dot);

      const frontier = createFrontier();
      updateFrontier(frontier, 'writer1', makeOid('sha123'));

      // Setup mock returns with valid OIDs
      // V5 writes 4 blobs: state, visible, frontier, appliedVV
      let blobIndex = 0;
      const blobOids = [makeOid('state'), makeOid('visible'), makeOid('frontier'), makeOid('appliedvv')];
      mockPersistence.writeBlob.mockImplementation(() => Promise.resolve(blobOids[blobIndex++]));
      mockPersistence.writeTree.mockResolvedValue(makeOid('tree'));
      mockPersistence.commitNodeWithTree.mockResolvedValue(makeOid('checkpoint'));

      // Execute
      const checkpointSha = await create({
        persistence: mockPersistence,
        graphName: 'test-graph',
        state,
        frontier,
        crypto,
      });

      // Verify
      expect(checkpointSha).toBe(makeOid('checkpoint'));
      expect(mockPersistence.writeBlob).toHaveBeenCalledTimes(4); // state, visible, frontier, appliedVV
      expect(mockPersistence.writeTree).toHaveBeenCalledTimes(1);
      expect(mockPersistence.commitNodeWithTree).toHaveBeenCalledTimes(1);
    });

    it('creates tree entries in sorted order', async () => {
      const state = createEmptyStateV5();
      const frontier = createFrontier();

      // V5 writes 4 blobs: state, visible, frontier, appliedVV
      const stateOid = makeOid('state');
      const visibleOid = makeOid('visible');
      const frontierOid = makeOid('frontier');
      const appliedVVOid = makeOid('appliedvv');
      let blobIndex = 0;
      mockPersistence.writeBlob.mockImplementation(() => {
        const oids = [stateOid, visibleOid, frontierOid, appliedVVOid];
        return Promise.resolve(oids[blobIndex++]);
      });
      mockPersistence.writeTree.mockResolvedValue(makeOid('tree'));
      mockPersistence.commitNodeWithTree.mockResolvedValue(makeOid('sha'));

      await create({
        persistence: mockPersistence,
        graphName: 'test',
        state,
        frontier,
        crypto,
      });

      // Tree entries should be sorted by filename
      // appliedVV.cbor < frontier.cbor < state.cbor < visible.cbor
      const treeEntries = mockPersistence.writeTree.mock.calls[0][0];
      expect(treeEntries).toHaveLength(4);
      expect(treeEntries[0]).toContain('appliedVV.cbor');
      expect(treeEntries[1]).toContain('frontier.cbor');
      expect(treeEntries[2]).toContain('state.cbor');
      expect(treeEntries[3]).toContain('visible.cbor');
    });

    it('includes parents in commit', async () => {
      const state = createEmptyStateV5();
      const frontier = createFrontier();

      mockPersistence.writeBlob.mockResolvedValue(makeOid('blob'));
      mockPersistence.writeTree.mockResolvedValue(makeOid('tree'));
      mockPersistence.commitNodeWithTree.mockResolvedValue(makeOid('sha'));

      await create({
        persistence: mockPersistence,
        graphName: 'test',
        state,
        frontier,
        parents: [makeOid('parent1'), makeOid('parent2')],
        crypto,
      });

      expect(mockPersistence.commitNodeWithTree).toHaveBeenCalledWith(
        expect.objectContaining({
          parents: [makeOid('parent1'), makeOid('parent2')],
        })
      );
    });

    it('encodes checkpoint message with correct trailers', async () => {
      // V5 state (schema:2 only)
      const state = createEmptyStateV5();
      const frontier = createFrontier();

      // V5 writes 4 blobs: state, visible, frontier, appliedVV
      let blobIndex = 0;
      const blobOids = ['aabbccdd00112233445566778899aabbccddeeff', 'ffeeddcc00112233445566778899aabbccddeeff', '1122334400112233445566778899aabbccddeeff', '2233445500112233445566778899aabbccddeeff'];
      mockPersistence.writeBlob.mockImplementation(() => Promise.resolve(blobOids[blobIndex++]));
      mockPersistence.writeTree.mockResolvedValue(makeOid('tree'));
      mockPersistence.commitNodeWithTree.mockResolvedValue(makeOid('sha'));

      await create({
        persistence: mockPersistence,
        graphName: 'my-graph',
        state,
        frontier,
        crypto,
      });

      const messageArg = mockPersistence.commitNodeWithTree.mock.calls[0][0].message;
      const decoded = decodeCheckpointMessage(messageArg);

      expect(decoded.kind).toBe('checkpoint');
      expect(decoded.graph).toBe('my-graph');
      expect(decoded.schema).toBe(2);
    });
  });

  describe('loadCheckpoint', () => {
    it('loads checkpoint state and frontier from commit', async () => {
      // Create V5 state (ORSet-based)
      const v5State = createEmptyStateV5();
      const dot = createDot('writer1', 1);
      orsetAdd(v5State.nodeAlive, 'node1', dot);
      orsetAdd(v5State.nodeAlive, 'node2', dot);
      orsetAdd(v5State.edgeAlive, encodeEdgeKeyV5('node1', 'node2', 'link'), dot);
      v5State.prop.set(encodePropKeyV5('node1', 'name'), {
        eventId: { lamport: 1, writerId: 'w', patchSha: makeOid('abc'), opIndex: 0 },
        value: { type: 'inline', value: 'test' },
      });

      const originalFrontier = createFrontier();
      updateFrontier(originalFrontier, 'writer1', makeOid('sha111'));

      // Serialize for mock returns
      const stateBuffer = serializeFullStateV5(v5State);
      const frontierBuffer = serializeFrontier(originalFrontier);
      const stateHash = await computeStateHashV5(v5State, { crypto });
      const appliedVV = computeAppliedVV(v5State);
      const appliedVVBuffer = serializeAppliedVV(appliedVV);

      const frontierOid = makeOid('frontierOid');
      const treeOid = makeOid('treeOid');
      const frontierBlobOid = makeOid('frontierBlob');
      const stateBlobOid = makeOid('stateBlob');
      const appliedVVBlobOid = makeOid('appliedVVBlob');

      // Setup mock checkpoint message
      const message = encodeCheckpointMessage({
        graph: 'test-graph',
        stateHash,
        frontierOid,
        indexOid: treeOid,
        schema: 2,
      });

      mockPersistence.showNode.mockResolvedValue(message);
      mockPersistence.getNodeInfo.mockResolvedValue({ sha: makeOid('checkpointSha') });
      mockPersistence.readTreeOids.mockResolvedValue({
        'frontier.cbor': frontierBlobOid,
        'state.cbor': stateBlobOid,
        'appliedVV.cbor': appliedVVBlobOid,
      });
      mockPersistence.readBlob.mockImplementation((/** @type {string} */ oid) => {
        if (oid === frontierBlobOid) return Promise.resolve(frontierBuffer);
        if (oid === stateBlobOid) return Promise.resolve(stateBuffer);
        if (oid === appliedVVBlobOid) return Promise.resolve(appliedVVBuffer);
        throw new Error(`Unknown oid: ${oid}`);
      });

      // Execute
      const result = await loadCheckpoint(mockPersistence, makeOid('checkpointSha'));

      // Verify
      expect(result.stateHash).toBe(stateHash);
      expect(result.schema).toBe(2);
      expect(result.frontier.get('writer1')).toBe(makeOid('sha111'));
      // V5 returns full ORSet state
      expect(result.state.nodeAlive.entries.has('node1')).toBe(true);
      expect(result.state.nodeAlive.entries.has('node2')).toBe(true);
    });

    it('throws if frontier.cbor is missing', async () => {
      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash: 'a'.repeat(64),
        frontierOid: 'a'.repeat(40),
        indexOid: 'b'.repeat(40),
        schema: 2,
      });

      mockPersistence.showNode.mockResolvedValue(message);
      mockPersistence.getNodeInfo.mockResolvedValue({ sha: 'sha' });
      mockPersistence.readTreeOids.mockResolvedValue({
        'state.cbor': 'state-oid',
        // Missing frontier.cbor
      });

      await expect(loadCheckpoint(mockPersistence, 'sha'))
        .rejects.toThrow('missing frontier.cbor');
    });

    it('throws if state.cbor is missing', async () => {
      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash: 'a'.repeat(64),
        frontierOid: 'a'.repeat(40),
        indexOid: 'b'.repeat(40),
        schema: 2,
      });

      mockPersistence.showNode.mockResolvedValue(message);
      mockPersistence.getNodeInfo.mockResolvedValue({ sha: 'sha' });
      mockPersistence.readTreeOids.mockResolvedValue({
        'frontier.cbor': 'frontier-oid',
        // Missing state.cbor
      });
      mockPersistence.readBlob.mockResolvedValue(serializeFrontier(createFrontier()));

      await expect(loadCheckpoint(mockPersistence, 'sha'))
        .rejects.toThrow('missing state.cbor');
    });

    it('throws for schema:1 checkpoints - migration required', async () => {
      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash: 'a'.repeat(64),
        frontierOid: 'a'.repeat(40),
        indexOid: 'b'.repeat(40),
        schema: 1,
      });

      mockPersistence.showNode.mockResolvedValue(message);

      await expect(loadCheckpoint(mockPersistence, makeOid('v1checkpoint')))
        .rejects.toThrow(/schema:1.*migration/i);
    });
  });

  // Note: materializeIncremental tests removed - they relied on schema:1 checkpoints
  // which are no longer supported as a runtime option.

  // Note: roundtrip test using createPatch (schema:1) removed - tests now focus on schema:2

  describe('schema:2 serialization', () => {
    describe('create', () => {
      it('creates checkpoint using v5 full state serializer', async () => {
        // Create v5 state (ORSet-based)
        const state = createEmptyStateV5();
        const dot = createDot('writer1', 1);
        orsetAdd(state.nodeAlive, 'node1', dot);
        orsetAdd(state.nodeAlive, 'node2', dot);
        orsetAdd(state.edgeAlive, encodeEdgeKeyV5('node1', 'node2', 'link'), dot);
        state.prop.set(encodePropKeyV5('node1', 'name'), {
          eventId: { lamport: 1, writerId: 'w', patchSha: makeOid('abc'), opIndex: 0 },
          value: { type: 'inline', value: 'Test' },
        });

        const frontier = createFrontier();
        updateFrontier(frontier, 'writer1', makeOid('sha1'));

        // Track written blobs (V5 writes 4 blobs: state, visible, frontier, appliedVV)
        /** @type {any[]} */
        const writtenBlobs = [];
        mockPersistence.writeBlob.mockImplementation((/** @type {any} */ buffer) => {
          writtenBlobs.push(buffer);
          return Promise.resolve(makeOid(`blob${writtenBlobs.length}`));
        });
        mockPersistence.writeTree.mockResolvedValue(makeOid('tree'));
        mockPersistence.commitNodeWithTree.mockResolvedValue(makeOid('sha'));

        await create({
          persistence: mockPersistence,
          graphName: 'test',
          state,
          frontier,
          crypto,
        });

        // Verify schema 2 was encoded in message
        const messageArg = mockPersistence.commitNodeWithTree.mock.calls[0][0].message;
        const decoded = decodeCheckpointMessage(messageArg);
        expect(decoded.schema).toBe(2);

        // Verify 4 blobs were written (state, visible, frontier, appliedVV)
        expect(writtenBlobs).toHaveLength(4);

        // First blob is full state - should deserialize with deserializeFullStateV5
        /** @type {any} */
        const deserializedFullState = deserializeFullStateV5(writtenBlobs[0]);
        expect(deserializedFullState.nodeAlive.entries.has('node1')).toBe(true);
        expect(deserializedFullState.nodeAlive.entries.get('node1').has('writer1:1')).toBe(true);

        // Second blob is visible projection - should deserialize with deserializeStateV5
        const deserializedVisible = deserializeStateV5(writtenBlobs[1]);
        expect(deserializedVisible.nodes).toContain('node1');
      });
    });

    describe('loadCheckpoint', () => {
      it('loads checkpoint with v5 full state deserializer', async () => {
        // Create v5 state and serialize it using FULL STATE serializer
        const v5State = createEmptyStateV5();
        const dot = createDot('writer1', 1);
        orsetAdd(v5State.nodeAlive, 'x', dot);
        orsetAdd(v5State.nodeAlive, 'y', dot);
        orsetAdd(v5State.edgeAlive, encodeEdgeKeyV5('x', 'y', 'conn'), dot);
        v5State.prop.set(encodePropKeyV5('x', 'val'), {
          eventId: { lamport: 1, writerId: 'w', patchSha: makeOid('p'), opIndex: 0 },
          value: { type: 'inline', value: 'hello' },
        });

        // V5 checkpoints use full state serialization
        const stateBuffer = serializeFullStateV5(v5State);
        const frontierBuffer = serializeFrontier(createFrontier());
        const stateHash = await computeStateHashV5(v5State, { crypto });
        const appliedVV = computeAppliedVV(v5State);
        const appliedVVBuffer = serializeAppliedVV(appliedVV);

        const treeOid = makeOid('tree');
        const frontierBlobOid = makeOid('frontier');
        const stateBlobOid = makeOid('state');
        const appliedVVBlobOid = makeOid('appliedvv');

        const message = encodeCheckpointMessage({
          graph: 'test',
          stateHash,
          frontierOid: frontierBlobOid,
          indexOid: treeOid,
          schema: 2,
        });

        mockPersistence.showNode.mockResolvedValue(message);
        mockPersistence.getNodeInfo.mockResolvedValue({ sha: makeOid('checkpoint') });
        mockPersistence.readTreeOids.mockResolvedValue({
          'frontier.cbor': frontierBlobOid,
          'state.cbor': stateBlobOid,
          'appliedVV.cbor': appliedVVBlobOid,
        });
        mockPersistence.readBlob.mockImplementation((/** @type {string} */ oid) => {
          if (oid === frontierBlobOid) return Promise.resolve(frontierBuffer);
          if (oid === stateBlobOid) return Promise.resolve(stateBuffer);
          if (oid === appliedVVBlobOid) return Promise.resolve(appliedVVBuffer);
          throw new Error(`Unknown oid: ${oid}`);
        });

        /** @type {any} */
        const result = await loadCheckpoint(mockPersistence, makeOid('checkpoint'));

        expect(result.schema).toBe(2);
        // V5 returns full ORSet state, not visible projection
        expect(result.state.nodeAlive.entries.has('x')).toBe(true);
        expect(result.state.nodeAlive.entries.has('y')).toBe(true);
        expect(result.state.nodeAlive.entries.get('x').has('writer1:1')).toBe(true);

        // Verify appliedVV was loaded
        expect(result.appliedVV).toBeDefined();
        expect(result.appliedVV.get('writer1')).toBe(1);
      });
    });

    describe('roundtrip', () => {
      it('roundtrip preserves full ORSet data', async () => {
        const state = createEmptyStateV5();
        const dot = createDot('writer1', 1);
        orsetAdd(state.nodeAlive, 'a', dot);
        orsetAdd(state.nodeAlive, 'b', dot);
        orsetAdd(state.edgeAlive, encodeEdgeKeyV5('a', 'b', 'rel'), dot);
        state.prop.set(encodePropKeyV5('a', 'color'), {
          eventId: { lamport: 1, writerId: 'w', patchSha: makeOid('p'), opIndex: 0 },
          value: { type: 'inline', value: 'red' },
        });

        const frontier = createFrontier();
        updateFrontier(frontier, 'writer1', makeOid('p'));

        // V5 writes 4 blobs: state, visible, frontier, appliedVV
        /** @type {any[]} */
        const writtenBlobs = [];
        /** @type {any} */
        let writtenMessage;

        mockPersistence.writeBlob.mockImplementation((/** @type {any} */ buffer) => {
          writtenBlobs.push(buffer);
          const names = ['state', 'visible', 'frontier', 'appliedvv'];
          return Promise.resolve(makeOid(names[writtenBlobs.length - 1]));
        });
        mockPersistence.writeTree.mockResolvedValue(makeOid('tree'));
        mockPersistence.commitNodeWithTree.mockImplementation((/** @type {any} */ { message }) => {
          writtenMessage = message;
          return Promise.resolve(makeOid('checkpoint'));
        });

        await create({
          persistence: mockPersistence,
          graphName: 'test',
          state,
          frontier,
          crypto,
        });

        // Setup for loading
        mockPersistence.showNode.mockResolvedValue(writtenMessage);
        mockPersistence.getNodeInfo.mockResolvedValue({ sha: makeOid('checkpoint') });
        mockPersistence.readTreeOids.mockResolvedValue({
          'state.cbor': makeOid('state'),
          'visible.cbor': makeOid('visible'),
          'frontier.cbor': makeOid('frontier'),
          'appliedVV.cbor': makeOid('appliedvv'),
        });
        mockPersistence.readBlob.mockImplementation((/** @type {string} */ oid) => {
          if (oid === makeOid('state')) return Promise.resolve(writtenBlobs[0]);
          if (oid === makeOid('visible')) return Promise.resolve(writtenBlobs[1]);
          if (oid === makeOid('frontier')) return Promise.resolve(writtenBlobs[2]);
          if (oid === makeOid('appliedvv')) return Promise.resolve(writtenBlobs[3]);
          throw new Error(`Unknown oid: ${oid}`);
        });

        /** @type {any} */
        const loaded = await loadCheckpoint(mockPersistence, makeOid('checkpoint'));

        expect(loaded.schema).toBe(2);
        // V5 returns full ORSet state with dots preserved
        expect(loaded.state.nodeAlive.entries.has('a')).toBe(true);
        expect(loaded.state.nodeAlive.entries.has('b')).toBe(true);
        expect(loaded.state.nodeAlive.entries.get('a').has('writer1:1')).toBe(true);

        // Verify edges
        const edgeKey = encodeEdgeKeyV5('a', 'b', 'rel');
        expect(loaded.state.edgeAlive.entries.has(edgeKey)).toBe(true);

        // Verify props
        const propKey = encodePropKeyV5('a', 'color');
        expect(loaded.state.prop.has(propKey)).toBe(true);
        expect(loaded.state.prop.get(propKey).value).toEqual({ type: 'inline', value: 'red' });

        // Verify appliedVV
        expect(loaded.appliedVV.get('writer1')).toBe(1);
      });
    });

    describe('reconstructStateV5FromCheckpoint', () => {
      it('creates ORSet-based state from visible projection', () => {
        const visibleProjection = {
          nodes: ['n1', 'n2', 'n3'],
          edges: [
            { from: 'n1', to: 'n2', label: 'a' },
            { from: 'n2', to: 'n3', label: 'b' },
          ],
          props: [
            { node: 'n1', key: 'x', value: { type: 'inline', value: 1 } },
            { node: 'n2', key: 'y', value: { type: 'inline', value: 2 } },
          ],
        };

        const state = reconstructStateV5FromCheckpoint(visibleProjection);

        // Verify nodes are in ORSet
        expect(orsetContains(state.nodeAlive, 'n1')).toBe(true);
        expect(orsetContains(state.nodeAlive, 'n2')).toBe(true);
        expect(orsetContains(state.nodeAlive, 'n3')).toBe(true);
        expect(orsetElements(state.nodeAlive).sort()).toEqual(['n1', 'n2', 'n3']);

        // Verify edges are in ORSet
        const edge1Key = encodeEdgeKeyV5('n1', 'n2', 'a');
        const edge2Key = encodeEdgeKeyV5('n2', 'n3', 'b');
        expect(orsetContains(state.edgeAlive, edge1Key)).toBe(true);
        expect(orsetContains(state.edgeAlive, edge2Key)).toBe(true);

        // Verify props are in LWW map
        const prop1Key = encodePropKeyV5('n1', 'x');
        const prop2Key = encodePropKeyV5('n2', 'y');
        expect(state.prop.has(prop1Key)).toBe(true);
        expect(state.prop.has(prop2Key)).toBe(true);
        expect(/** @type {any} */ (state.prop.get(prop1Key)).value).toEqual({ type: 'inline', value: 1 });
        expect(/** @type {any} */ (state.prop.get(prop2Key)).value).toEqual({ type: 'inline', value: 2 });

        // Verify observedFrontier exists
        expect(state.observedFrontier).toBeDefined();
      });

      it('handles empty projection', () => {
        const visibleProjection = {
          nodes: [],
          edges: [],
          props: [],
        };

        const state = reconstructStateV5FromCheckpoint(visibleProjection);

        expect(orsetElements(state.nodeAlive)).toHaveLength(0);
        expect(orsetElements(state.edgeAlive)).toHaveLength(0);
        expect(state.prop.size).toBe(0);
      });
    });
  });

  describe('V5 checkpoint with full ORSet state', () => {
    /** @type {any} */
    /** @type {any} */
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

    describe('createV5', () => {
      it('creates V5 checkpoint with full state and visible projection', async () => {
        // Create V5 state with nodes, edges, props
        const state = createEmptyStateV5();
        const dot1 = createDot('alice', 1);
        const dot2 = createDot('alice', 2);
        orsetAdd(state.nodeAlive, 'n1', dot1);
        orsetAdd(state.nodeAlive, 'n2', dot2);
        orsetAdd(state.edgeAlive, encodeEdgeKeyV5('n1', 'n2', 'link'), createDot('alice', 3));
        state.prop.set(encodePropKeyV5('n1', 'name'), {
          eventId: { lamport: 1, writerId: 'alice', patchSha: makeOid('p1'), opIndex: 0 },
          value: { type: 'inline', value: 'Node1' },
        });

        const frontier = createFrontier();
        updateFrontier(frontier, 'alice', makeOid('sha1'));

        // Track written blobs
        /** @type {any[]} */
        const writtenBlobs = [];
        mockPersistence.writeBlob.mockImplementation((/** @type {any} */ buffer) => {
          writtenBlobs.push(buffer);
          return Promise.resolve(makeOid(`blob${writtenBlobs.length}`));
        });
        mockPersistence.writeTree.mockResolvedValue(makeOid('tree'));
        mockPersistence.commitNodeWithTree.mockResolvedValue(makeOid('checkpoint'));

        const result = await createV5({
          persistence: mockPersistence,
          graphName: 'test',
          state,
          frontier,
          crypto,
        });

        // Verify 4 blobs were written (state, visible, frontier, appliedVV)
        expect(mockPersistence.writeBlob).toHaveBeenCalledTimes(4);

        // Verify tree has all 4 entries
        const treeEntries = mockPersistence.writeTree.mock.calls[0][0];
        expect(treeEntries).toHaveLength(4);
        expect(treeEntries.some((/** @type {string} */ e) => e.includes('state.cbor'))).toBe(true);
        expect(treeEntries.some((/** @type {string} */ e) => e.includes('visible.cbor'))).toBe(true);
        expect(treeEntries.some((/** @type {string} */ e) => e.includes('frontier.cbor'))).toBe(true);
        expect(treeEntries.some((/** @type {string} */ e) => e.includes('appliedVV.cbor'))).toBe(true);

        // Verify schema 2 in message
        const messageArg = mockPersistence.commitNodeWithTree.mock.calls[0][0].message;
        const decoded = decodeCheckpointMessage(messageArg);
        expect(decoded.schema).toBe(2);
      });

      it('compacts tombstoned dots when compact=true', async () => {
        const state = createEmptyStateV5();
        const dot = createDot('alice', 1);
        orsetAdd(state.nodeAlive, 'deleted', dot);
        orsetRemove(state.nodeAlive, new Set([encodeDot(dot)]));

        const frontier = createFrontier();
        updateFrontier(frontier, 'alice', makeOid('sha1'));

        /** @type {any} */
        /** @type {any} */
        let capturedStateBuffer;
        mockPersistence.writeBlob.mockImplementation((/** @type {any} */ buffer) => {
          if (!capturedStateBuffer) {
            capturedStateBuffer = buffer;
          }
          return Promise.resolve(makeOid('blob'));
        });
        mockPersistence.writeTree.mockResolvedValue(makeOid('tree'));
        mockPersistence.commitNodeWithTree.mockResolvedValue(makeOid('checkpoint'));

        await createV5({
          persistence: mockPersistence,
          graphName: 'test',
          state,
          frontier,
          compact: true,
          crypto,
        });

        // Verify the state blob was compacted (tombstoned entry removed)
        const restoredState = deserializeFullStateV5(capturedStateBuffer);
        // After compaction, the tombstoned entry should be removed
        expect(restoredState.nodeAlive.entries.has('deleted')).toBe(false);
        expect(restoredState.nodeAlive.tombstones.size).toBe(0);
      });

      it('preserves tombstoned dots when compact=false', async () => {
        const state = createEmptyStateV5();
        const dot = createDot('alice', 1);
        orsetAdd(state.nodeAlive, 'deleted', dot);
        orsetRemove(state.nodeAlive, new Set([encodeDot(dot)]));

        const frontier = createFrontier();
        updateFrontier(frontier, 'alice', makeOid('sha1'));

        /** @type {any} */
        /** @type {any} */
        let capturedStateBuffer;
        mockPersistence.writeBlob.mockImplementation((/** @type {any} */ buffer) => {
          if (!capturedStateBuffer) {
            capturedStateBuffer = buffer;
          }
          return Promise.resolve(makeOid('blob'));
        });
        mockPersistence.writeTree.mockResolvedValue(makeOid('tree'));
        mockPersistence.commitNodeWithTree.mockResolvedValue(makeOid('checkpoint'));

        await createV5({
          persistence: mockPersistence,
          graphName: 'test',
          state,
          frontier,
          compact: false,
          crypto,
        });

        // Verify the state blob preserves tombstoned entry
        const restoredState = deserializeFullStateV5(capturedStateBuffer);
        expect(restoredState.nodeAlive.entries.has('deleted')).toBe(true);
        expect(restoredState.nodeAlive.tombstones.has('alice:1')).toBe(true);
      });
    });

    describe('loadCheckpoint for V5', () => {
      it('loads V5 checkpoint with full ORSet state', async () => {
        // Create and serialize V5 state
        const originalState = createEmptyStateV5();
        const dot1 = createDot('alice', 1);
        const dot2 = createDot('bob', 2);
        orsetAdd(originalState.nodeAlive, 'x', dot1);
        orsetAdd(originalState.nodeAlive, 'y', dot2);
        orsetAdd(originalState.edgeAlive, encodeEdgeKeyV5('x', 'y', 'conn'), createDot('alice', 3));
        originalState.prop.set(encodePropKeyV5('x', 'val'), {
          eventId: { lamport: 5, writerId: 'alice', patchSha: makeOid('p'), opIndex: 0 },
          value: { type: 'inline', value: 42 },
        });

        const frontier = createFrontier();
        updateFrontier(frontier, 'alice', makeOid('sha1'));

        // Serialize buffers
        const stateBuffer = serializeFullStateV5(originalState);
        const visibleBuffer = serializeStateV5(originalState);
        const frontierBuffer = serializeFrontier(frontier);
        const appliedVV = computeAppliedVV(originalState);
        const appliedVVBuffer = serializeAppliedVV(appliedVV);
        const stateHash = await computeStateHashV5(originalState, { crypto });

        const treeOid = makeOid('tree');
        const stateBlobOid = makeOid('state');
        const visibleBlobOid = makeOid('visible');
        const frontierBlobOid = makeOid('frontier');
        const appliedVVBlobOid = makeOid('appliedvv');

        const message = encodeCheckpointMessage({
          graph: 'test',
          stateHash,
          frontierOid: frontierBlobOid,
          indexOid: treeOid,
          schema: 2,
        });

        mockPersistence.showNode.mockResolvedValue(message);
        mockPersistence.getNodeInfo.mockResolvedValue({ sha: makeOid('checkpoint') });
        mockPersistence.readTreeOids.mockResolvedValue({
          'state.cbor': stateBlobOid,
          'visible.cbor': visibleBlobOid,
          'frontier.cbor': frontierBlobOid,
          'appliedVV.cbor': appliedVVBlobOid,
        });
        mockPersistence.readBlob.mockImplementation((/** @type {string} */ oid) => {
          if (oid === stateBlobOid) return Promise.resolve(stateBuffer);
          if (oid === visibleBlobOid) return Promise.resolve(visibleBuffer);
          if (oid === frontierBlobOid) return Promise.resolve(frontierBuffer);
          if (oid === appliedVVBlobOid) return Promise.resolve(appliedVVBuffer);
          throw new Error(`Unknown oid: ${oid}`);
        });

        /** @type {any} */
        const result = await loadCheckpoint(mockPersistence, makeOid('checkpoint'));

        // Verify schema
        expect(result.schema).toBe(2);

        // Verify full state was loaded (not visible projection)
        expect(result.state.nodeAlive).toBeDefined();
        expect(result.state.nodeAlive.entries).toBeDefined();
        expect(result.state.nodeAlive.entries.has('x')).toBe(true);
        expect(result.state.nodeAlive.entries.has('y')).toBe(true);

        // Verify dots are preserved
        expect(result.state.nodeAlive.entries.get('x').has('alice:1')).toBe(true);
        expect(result.state.nodeAlive.entries.get('y').has('bob:2')).toBe(true);

        // Verify appliedVV was loaded
        expect(result.appliedVV).toBeDefined();
        expect(result.appliedVV.get('alice')).toBe(3);
        expect(result.appliedVV.get('bob')).toBe(2);
      });

      it('loads V5 checkpoint without appliedVV for backward compatibility', async () => {
        // Create V5 state
        const originalState = createEmptyStateV5();
        orsetAdd(originalState.nodeAlive, 'a', createDot('w1', 1));

        const frontier = createFrontier();
        updateFrontier(frontier, 'w1', makeOid('sha1'));

        const stateBuffer = serializeFullStateV5(originalState);
        const frontierBuffer = serializeFrontier(frontier);
        const stateHash = await computeStateHashV5(originalState, { crypto });

        const treeOid = makeOid('tree');
        const stateBlobOid = makeOid('state');
        const frontierBlobOid = makeOid('frontier');

        const message = encodeCheckpointMessage({
          graph: 'test',
          stateHash,
          frontierOid: frontierBlobOid,
          indexOid: treeOid,
          schema: 2,
        });

        mockPersistence.showNode.mockResolvedValue(message);
        mockPersistence.getNodeInfo.mockResolvedValue({ sha: makeOid('checkpoint') });
        mockPersistence.readTreeOids.mockResolvedValue({
          'state.cbor': stateBlobOid,
          'frontier.cbor': frontierBlobOid,
          // No appliedVV.cbor
        });
        mockPersistence.readBlob.mockImplementation((/** @type {string} */ oid) => {
          if (oid === stateBlobOid) return Promise.resolve(stateBuffer);
          if (oid === frontierBlobOid) return Promise.resolve(frontierBuffer);
          throw new Error(`Unknown oid: ${oid}`);
        });

        /** @type {any} */
        const result = await loadCheckpoint(mockPersistence, makeOid('checkpoint'));

        expect(result.schema).toBe(2);
        expect(result.state.nodeAlive.entries.has('a')).toBe(true);
        expect(result.appliedVV).toBeNull();
      });
    });

    describe('V5 checkpoint roundtrip', () => {
      it('create -> loadCheckpoint preserves full state', async () => {
        // Build V5 state with various elements
        const state = createEmptyStateV5();
        const aliceDot1 = createDot('alice', 1);
        const aliceDot2 = createDot('alice', 2);
        const bobDot1 = createDot('bob', 1);

        orsetAdd(state.nodeAlive, 'n1', aliceDot1);
        orsetAdd(state.nodeAlive, 'n2', aliceDot2);
        orsetAdd(state.nodeAlive, 'n3', bobDot1);
        orsetAdd(state.edgeAlive, encodeEdgeKeyV5('n1', 'n2', 'follows'), createDot('alice', 3));
        orsetAdd(state.edgeAlive, encodeEdgeKeyV5('n2', 'n3', 'knows'), createDot('bob', 2));

        state.prop.set(encodePropKeyV5('n1', 'name'), {
          eventId: { lamport: 10, writerId: 'alice', patchSha: makeOid('p1'), opIndex: 0 },
          value: { type: 'inline', value: 'Alice' },
        });

        const frontier = createFrontier();
        updateFrontier(frontier, 'alice', makeOid('sha1'));
        updateFrontier(frontier, 'bob', makeOid('sha2'));

        // Capture written data during create
        /** @type {any} */ let writtenStateBlob;
        /** @type {any} */ let writtenVisibleBlob;
        /** @type {any} */ let writtenFrontierBlob;
        /** @type {any} */ let writtenAppliedVVBlob;
        /** @type {any} */
        let writtenMessage;
        let blobIndex = 0;

        mockPersistence.writeBlob.mockImplementation((/** @type {any} */ buffer) => {
          switch (blobIndex++) {
            case 0:
              writtenStateBlob = buffer;
              return Promise.resolve(makeOid('stateOid'));
            case 1:
              writtenVisibleBlob = buffer;
              return Promise.resolve(makeOid('visibleOid'));
            case 2:
              writtenFrontierBlob = buffer;
              return Promise.resolve(makeOid('frontierOid'));
            case 3:
              writtenAppliedVVBlob = buffer;
              return Promise.resolve(makeOid('appliedVVOid'));
            default:
              return Promise.reject(new Error('Unexpected blob write'));
          }
        });
        mockPersistence.writeTree.mockResolvedValue(makeOid('treeOid'));
        mockPersistence.commitNodeWithTree.mockImplementation((/** @type {any} */ { message }) => {
          writtenMessage = message;
          return Promise.resolve(makeOid('checkpointSha'));
        });

        // Create checkpoint
        await create(/** @type {any} */ ({
          persistence: mockPersistence,
          graphName: 'roundtrip-v5',
          state,
          frontier,
          schema: 2,
          compact: false, // Don't compact to preserve all state
          crypto,
        }));

        // Setup mocks for loading
        mockPersistence.showNode.mockResolvedValue(writtenMessage);
        mockPersistence.getNodeInfo.mockResolvedValue({ sha: makeOid('checkpointSha') });
        mockPersistence.readTreeOids.mockResolvedValue({
          'state.cbor': makeOid('stateOid'),
          'visible.cbor': makeOid('visibleOid'),
          'frontier.cbor': makeOid('frontierOid'),
          'appliedVV.cbor': makeOid('appliedVVOid'),
        });
        mockPersistence.readBlob.mockImplementation((/** @type {string} */ oid) => {
          if (oid === makeOid('stateOid')) return Promise.resolve(writtenStateBlob);
          if (oid === makeOid('visibleOid')) return Promise.resolve(writtenVisibleBlob);
          if (oid === makeOid('frontierOid')) return Promise.resolve(writtenFrontierBlob);
          if (oid === makeOid('appliedVVOid')) return Promise.resolve(writtenAppliedVVBlob);
          throw new Error(`Unknown oid: ${oid}`);
        });

        // Load checkpoint
        /** @type {any} */
        const loaded = await loadCheckpoint(mockPersistence, makeOid('checkpointSha'));

        // Verify schema
        expect(loaded.schema).toBe(2);

        // Verify nodes with dots preserved
        expect(loaded.state.nodeAlive.entries.has('n1')).toBe(true);
        expect(loaded.state.nodeAlive.entries.has('n2')).toBe(true);
        expect(loaded.state.nodeAlive.entries.has('n3')).toBe(true);
        expect(loaded.state.nodeAlive.entries.get('n1').has('alice:1')).toBe(true);
        expect(loaded.state.nodeAlive.entries.get('n2').has('alice:2')).toBe(true);
        expect(loaded.state.nodeAlive.entries.get('n3').has('bob:1')).toBe(true);

        // Verify edges with dots preserved
        const edge1Key = encodeEdgeKeyV5('n1', 'n2', 'follows');
        const edge2Key = encodeEdgeKeyV5('n2', 'n3', 'knows');
        expect(loaded.state.edgeAlive.entries.has(edge1Key)).toBe(true);
        expect(loaded.state.edgeAlive.entries.has(edge2Key)).toBe(true);

        // Verify props
        const propKey = encodePropKeyV5('n1', 'name');
        expect(loaded.state.prop.has(propKey)).toBe(true);
        expect(loaded.state.prop.get(propKey).value).toEqual({ type: 'inline', value: 'Alice' });

        // Verify frontier
        expect(loaded.frontier.get('alice')).toBe(makeOid('sha1'));
        expect(loaded.frontier.get('bob')).toBe(makeOid('sha2'));

        // Verify appliedVV
        expect(loaded.appliedVV.get('alice')).toBe(3);
        expect(loaded.appliedVV.get('bob')).toBe(2);
      });

      it('compaction during checkpoint preserves visible hash', async () => {
        // Build state with a tombstoned element
        const state = createEmptyStateV5();
        const addDot = createDot('alice', 1);
        orsetAdd(state.nodeAlive, 'live', createDot('alice', 2));
        orsetAdd(state.nodeAlive, 'deleted', addDot);
        orsetRemove(state.nodeAlive, new Set([encodeDot(addDot)]));

        const frontier = createFrontier();
        updateFrontier(frontier, 'alice', makeOid('sha1'));

        // Compute hash before compaction
        const hashBeforeCompact = await computeStateHashV5(state, { crypto });

        // Create checkpoint with compaction
        /** @type {any} */
        /** @type {any} */
        let writtenVisibleBlob;
        let blobIndex = 0;
        mockPersistence.writeBlob.mockImplementation((/** @type {any} */ buffer) => {
          if (blobIndex === 1) {
            writtenVisibleBlob = buffer;
          }
          blobIndex++;
          return Promise.resolve(makeOid(`blob${blobIndex}`));
        });
        mockPersistence.writeTree.mockResolvedValue(makeOid('tree'));
        mockPersistence.commitNodeWithTree.mockResolvedValue(makeOid('checkpoint'));

        await create(/** @type {any} */ ({
          persistence: mockPersistence,
          graphName: 'test',
          state,
          frontier,
          schema: 2,
          compact: true,
          crypto,
        }));

        // Verify the state hash in checkpoint message matches visible projection
        const messageArg = mockPersistence.commitNodeWithTree.mock.calls[0][0].message;
        const decoded = decodeCheckpointMessage(messageArg);

        // The visible projection should only show 'live' (deleted is tombstoned)
        const visible = deserializeStateV5(writtenVisibleBlob);
        expect(visible.nodes).toContain('live');
        expect(visible.nodes).not.toContain('deleted');
      });
    });

    describe('appliedVV correctness', () => {
      it('appliedVV is computed and saved correctly', async () => {
        const state = createEmptyStateV5();
        // Add various dots
        orsetAdd(state.nodeAlive, 'a', createDot('alice', 5));
        orsetAdd(state.nodeAlive, 'b', createDot('alice', 3));
        orsetAdd(state.nodeAlive, 'c', createDot('bob', 7));
        orsetAdd(state.edgeAlive, encodeEdgeKeyV5('a', 'b', 'x'), createDot('alice', 10));

        const frontier = createFrontier();
        updateFrontier(frontier, 'alice', makeOid('sha1'));
        updateFrontier(frontier, 'bob', makeOid('sha2'));

        /** @type {any} */
        let capturedAppliedVVBlob;
        let blobIndex = 0;
        mockPersistence.writeBlob.mockImplementation((/** @type {any} */ buffer) => {
          if (blobIndex === 3) {
            capturedAppliedVVBlob = buffer;
          }
          blobIndex++;
          return Promise.resolve(makeOid(`blob${blobIndex}`));
        });
        mockPersistence.writeTree.mockResolvedValue(makeOid('tree'));
        mockPersistence.commitNodeWithTree.mockResolvedValue(makeOid('checkpoint'));

        await createV5({
          persistence: mockPersistence,
          graphName: 'test',
          state,
          frontier,
          compact: false,
          crypto,
        });

        // Deserialize and verify appliedVV
        const appliedVV = deserializeAppliedVV(capturedAppliedVVBlob);
        expect(appliedVV.get('alice')).toBe(10); // max counter for alice
        expect(appliedVV.get('bob')).toBe(7); // max counter for bob
      });
    });
  });
});
