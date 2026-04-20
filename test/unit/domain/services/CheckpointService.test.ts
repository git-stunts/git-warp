import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create, createV5 } from '../../../../src/domain/services/state/checkpointCreate.ts';
import { loadCheckpoint, reconstructStateFromCheckpoint } from '../../../../src/domain/services/state/checkpointLoad.ts';
import { createFrontier, updateFrontier, serializeFrontier } from '../../../../src/domain/services/Frontier.ts';
import { computeStateHash } from '../../../../src/domain/services/state/StateSerializer.ts';
import {
  serializeFullState,
  deserializeFullState,
  computeAppliedVV,
  serializeAppliedVV,
  deserializeAppliedVV,
} from '../../../../src/domain/services/state/CheckpointSerializer.ts';
import { createEmptyState, encodeEdgeKey as encodeEdgeKeyV5, encodePropKey as encodePropKeyV5 } from '../../../../src/domain/services/JoinReducer.ts';
import { encodeCheckpointMessage, decodeCheckpointMessage } from '../../../../src/domain/services/codec/WarpMessageCodec.ts';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import { CONTENT_PROPERTY_KEY, encodeEdgePropKey } from '../../../../src/domain/services/KeyCodec.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';

const crypto = new NodeCryptoAdapter();

// Helper to create valid 40-char hex OIDs for testing
const makeOid = (prefix) => {
  const base = prefix.replace(/[^0-9a-f]/gi, '0').toLowerCase();
  return (base + '0'.repeat(40)).slice(0, 40);
};

const makeSequentialOid = (index) => index.toString(16).padStart(40, '0');

describe('CheckpointService', () => {
    let mockPersistence: any;

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
      const state = createEmptyState();
      const dot = Dot.create('writer1', 1);
      state.nodeAlive.add('x', dot);

      const frontier = createFrontier();
      updateFrontier(frontier, 'writer1', makeOid('sha123'));

      // Setup mock returns with valid OIDs
      // V5 writes 3 blobs: state, frontier, appliedVV
      let blobIndex = 0;
      const blobOids = [makeOid('state'), makeOid('frontier'), makeOid('appliedvv')];
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
      expect(mockPersistence.writeBlob).toHaveBeenCalledTimes(3); // state, frontier, appliedVV
      expect(mockPersistence.writeTree).toHaveBeenCalledTimes(1);
      expect(mockPersistence.commitNodeWithTree).toHaveBeenCalledTimes(1);
    });

    it('creates tree entries in sorted order', async () => {
      const state = createEmptyState();
      const frontier = createFrontier();

      // V5 writes 3 blobs: state, frontier, appliedVV
      const stateOid = makeOid('state');
      const frontierOid = makeOid('frontier');
      const appliedVVOid = makeOid('appliedvv');
      let blobIndex = 0;
      mockPersistence.writeBlob.mockImplementation(() => {
        const oids = [stateOid, frontierOid, appliedVVOid];
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
      // appliedVV.cbor < frontier.cbor < state.cbor
      const treeEntries = mockPersistence.writeTree.mock.calls[0][0];
      expect(treeEntries).toHaveLength(3);
      expect(treeEntries[0]).toContain('appliedVV.cbor');
      expect(treeEntries[1]).toContain('frontier.cbor');
      expect(treeEntries[2]).toContain('state.cbor');
    });

    it('includes parents in commit', async () => {
      const state = createEmptyState();
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
      const state = createEmptyState();
      const frontier = createFrontier();

      // V5 writes 3 blobs: state, frontier, appliedVV
      let blobIndex = 0;
      const blobOids = ['aabbccdd00112233445566778899aabbccddeeff', '1122334400112233445566778899aabbccddeeff', '2233445500112233445566778899aabbccddeeff'];
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

    it('creates schema:5 envelope tree with state subtree instead of state.cbor', async () => {
      const state = createEmptyState();
      const frontier = createFrontier();

      let blobIndex = 0;
      const blobOids = [
        makeOid('prop'),
        makeOid('observed'),
        makeOid('edgebirth'),
        makeOid('frontier'),
        makeOid('appliedvv'),
      ];
      mockPersistence.writeBlob.mockImplementation(() => Promise.resolve(blobOids[blobIndex++]));
      mockPersistence.writeTree
        .mockResolvedValueOnce(makeOid('state-tree'))
        .mockResolvedValueOnce(makeOid('envelope-tree'));
      mockPersistence.commitNodeWithTree.mockResolvedValue(makeOid('checkpoint'));

      await create({
        persistence: mockPersistence,
        graphName: 'test',
        state,
        frontier,
        crypto,
      });

      expect(mockPersistence.writeTree).toHaveBeenCalledTimes(2);

      const stateEntries = mockPersistence.writeTree.mock.calls[0][0];
      expect(stateEntries.some((entry) => entry.includes('\tprop.cbor'))).toBe(true);
      expect(stateEntries.some((entry) => entry.includes('\tobservedFrontier.cbor'))).toBe(true);
      expect(stateEntries.some((entry) => entry.includes('\tedgeBirthEvent.cbor'))).toBe(true);

      const envelopeEntries = mockPersistence.writeTree.mock.calls[1][0];
      expect(envelopeEntries.some((entry) => entry.includes('\tstate'))).toBe(true);
      expect(envelopeEntries.some((entry) => entry.includes('\tstate.cbor'))).toBe(false);

      const messageArg = mockPersistence.commitNodeWithTree.mock.calls[0][0].message;
      const decoded = decodeCheckpointMessage(messageArg);
      expect(decoded.schema).toBe(5);
    });
  });

  describe('loadCheckpoint', () => {
    it('loads checkpoint state and frontier from commit', async () => {
      // Create V5 state (ORSet-based)
      const v5State = createEmptyState();
      const dot = Dot.create('writer1', 1);
      v5State.nodeAlive.add('node1', dot);
      v5State.nodeAlive.add('node2', dot);
      v5State.edgeAlive.add(encodeEdgeKeyV5('node1', 'node2', 'link'), dot);
      v5State.prop.set(encodePropKeyV5('node1', 'name'), {
        eventId: { lamport: 1, writerId: 'w', patchSha: makeOid('abc'), opIndex: 0 },
        value: { type: 'inline', value: 'test' },
      });

      const originalFrontier = createFrontier();
      updateFrontier(originalFrontier, 'writer1', makeOid('sha111'));

      // Serialize for mock returns
      const stateBuffer = serializeFullState(v5State);
      const frontierBuffer = serializeFrontier(originalFrontier);
      const stateHash = await computeStateHash(v5State, { crypto });
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
      mockPersistence.readBlob.mockImplementation((oid) => {
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

    it('loads schema:5 checkpoint envelope without requiring state.cbor', async () => {
      const frontier = createFrontier();
      updateFrontier(frontier, 'writer1', makeOid('sha111'));

      const emptyState = createEmptyState();
      const stateHash = await computeStateHash(emptyState, { crypto });
      const frontierBuffer = serializeFrontier(frontier);
      const appliedVVBuffer = serializeAppliedVV(computeAppliedVV(emptyState));

      const frontierBlobOid = makeOid('frontier');
      const appliedVVBlobOid = makeOid('appliedvv');

      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash,
        frontierOid: frontierBlobOid,
        indexOid: makeOid('envelope'),
        schema: 5,
      });

      mockPersistence.showNode.mockResolvedValue(message);
      mockPersistence.getNodeInfo.mockResolvedValue({ sha: makeOid('checkpoint') });
      mockPersistence.readTreeOids.mockResolvedValue({
        'state': makeOid('state-tree'),
        'state/nodeAlive': makeOid('node-root'),
        'state/edgeAlive': makeOid('edge-root'),
        'state/prop.cbor': makeOid('prop'),
        'state/observedFrontier.cbor': makeOid('observed'),
        'state/edgeBirthEvent.cbor': makeOid('edgebirth'),
        'frontier.cbor': frontierBlobOid,
        'appliedVV.cbor': appliedVVBlobOid,
      });
      mockPersistence.readBlob.mockImplementation((oid) => {
        if (oid === frontierBlobOid) {
          return Promise.resolve(frontierBuffer);
        }
        if (oid === appliedVVBlobOid) {
          return Promise.resolve(appliedVVBuffer);
        }
        return Promise.resolve(new Uint8Array());
      });

      const result = await loadCheckpoint(mockPersistence, makeOid('checkpoint'));

      expect(result.schema).toBe(5);
      expect(result.frontier.get('writer1')).toBe(makeOid('sha111'));
    });
  });

  // Note: materializeIncremental tests removed - they relied on schema:1 checkpoints
  // which are no longer supported as a runtime option.

  // Note: roundtrip test using createPatch (schema:1) removed - tests now focus on schema:2

  describe('schema:2 serialization', () => {
    describe('create', () => {
      it('creates checkpoint using v5 full state serializer', async () => {
        // Create v5 state (ORSet-based)
        const state = createEmptyState();
        const dot = Dot.create('writer1', 1);
        state.nodeAlive.add('node1', dot);
        state.nodeAlive.add('node2', dot);
        state.edgeAlive.add(encodeEdgeKeyV5('node1', 'node2', 'link'), dot);
        state.prop.set(encodePropKeyV5('node1', 'name'), {
          eventId: { lamport: 1, writerId: 'w', patchSha: makeOid('abc'), opIndex: 0 },
          value: { type: 'inline', value: 'Test' },
        });

        const frontier = createFrontier();
        updateFrontier(frontier, 'writer1', makeOid('sha1'));

        // Track written blobs (V5 writes 3 blobs: state, frontier, appliedVV)
                const writtenBlobs: any[] = [];
        mockPersistence.writeBlob.mockImplementation((buffer) => {
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

        // Verify 3 blobs were written (state, frontier, appliedVV)
        expect(writtenBlobs).toHaveLength(3);

        // First blob is full state - should deserialize with deserializeFullState
        const deserializedFullState: any = deserializeFullState(writtenBlobs[0]);
        expect(deserializedFullState.nodeAlive.entries.has('node1')).toBe(true);
        expect(deserializedFullState.nodeAlive.entries.get('node1').has('writer1:1')).toBe(true);
      });
    });

    describe('loadCheckpoint', () => {
      it('loads checkpoint with v5 full state deserializer', async () => {
        // Create v5 state and serialize it using FULL STATE serializer
        const v5State = createEmptyState();
        const dot = Dot.create('writer1', 1);
        v5State.nodeAlive.add('x', dot);
        v5State.nodeAlive.add('y', dot);
        v5State.edgeAlive.add(encodeEdgeKeyV5('x', 'y', 'conn'), dot);
        v5State.prop.set(encodePropKeyV5('x', 'val'), {
          eventId: { lamport: 1, writerId: 'w', patchSha: makeOid('p'), opIndex: 0 },
          value: { type: 'inline', value: 'hello' },
        });

        // V5 checkpoints use full state serialization
        const stateBuffer = serializeFullState(v5State);
        const frontierBuffer = serializeFrontier(createFrontier());
        const stateHash = await computeStateHash(v5State, { crypto });
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
        mockPersistence.readBlob.mockImplementation((oid) => {
          if (oid === frontierBlobOid) return Promise.resolve(frontierBuffer);
          if (oid === stateBlobOid) return Promise.resolve(stateBuffer);
          if (oid === appliedVVBlobOid) return Promise.resolve(appliedVVBuffer);
          throw new Error(`Unknown oid: ${oid}`);
        });

        const result: any = await loadCheckpoint(mockPersistence, makeOid('checkpoint'));

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
        const state = createEmptyState();
        const dot = Dot.create('writer1', 1);
        state.nodeAlive.add('a', dot);
        state.nodeAlive.add('b', dot);
        state.edgeAlive.add(encodeEdgeKeyV5('a', 'b', 'rel'), dot);
        state.prop.set(encodePropKeyV5('a', 'color'), {
          eventId: { lamport: 1, writerId: 'w', patchSha: makeOid('p'), opIndex: 0 },
          value: { type: 'inline', value: 'red' },
        });

        const frontier = createFrontier();
        updateFrontier(frontier, 'writer1', makeOid('p'));

        // V5 writes 3 blobs: state, frontier, appliedVV
                const writtenBlobs: any[] = [];
                let writtenMessage: any;

        mockPersistence.writeBlob.mockImplementation((buffer) => {
          writtenBlobs.push(buffer);
          const names = ['state', 'frontier', 'appliedvv'];
          return Promise.resolve(makeOid(names[writtenBlobs.length - 1] ?? 'unknown'));
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
          'frontier.cbor': makeOid('frontier'),
          'appliedVV.cbor': makeOid('appliedvv'),
        });
        mockPersistence.readBlob.mockImplementation((oid) => {
          if (oid === makeOid('state')) return Promise.resolve(writtenBlobs[0]);
          if (oid === makeOid('frontier')) return Promise.resolve(writtenBlobs[1]);
          if (oid === makeOid('appliedvv')) return Promise.resolve(writtenBlobs[2]);
          throw new Error(`Unknown oid: ${oid}`);
        });

        const loaded: any = await loadCheckpoint(mockPersistence, makeOid('checkpoint'));

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

    describe('reconstructStateFromCheckpoint', () => {
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

        const state = reconstructStateFromCheckpoint(visibleProjection);

        // Verify nodes are in ORSet
        expect(state.nodeAlive.contains('n1')).toBe(true);
        expect(state.nodeAlive.contains('n2')).toBe(true);
        expect(state.nodeAlive.contains('n3')).toBe(true);
        expect(state.nodeAlive.elements().sort()).toEqual(['n1', 'n2', 'n3']);

        // Verify edges are in ORSet
        const edge1Key = encodeEdgeKeyV5('n1', 'n2', 'a');
        const edge2Key = encodeEdgeKeyV5('n2', 'n3', 'b');
        expect(state.edgeAlive.contains(edge1Key)).toBe(true);
        expect(state.edgeAlive.contains(edge2Key)).toBe(true);

        // Verify props are in LWW map
        const prop1Key = encodePropKeyV5('n1', 'x');
        const prop2Key = encodePropKeyV5('n2', 'y');
        expect(state.prop.has(prop1Key)).toBe(true);
        expect(state.prop.has(prop2Key)).toBe(true);
        expect((state.prop.get(prop1Key as any))!.value).toEqual({ type: 'inline', value: 1 });
        expect((state.prop.get(prop2Key as any))!.value).toEqual({ type: 'inline', value: 2 });

        // Verify observedFrontier exists
        expect(state.observedFrontier).toBeDefined();
      });

      it('handles empty projection', () => {
        const visibleProjection = {
          nodes: [],
          edges: [],
          props: [],
        };

        const state = reconstructStateFromCheckpoint(visibleProjection);

        expect(state.nodeAlive.elements()).toHaveLength(0);
        expect(state.edgeAlive.elements()).toHaveLength(0);
        expect(state.prop.size).toBe(0);
      });
    });
  });

  describe('V5 checkpoint with full ORSet state', () => {
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

    describe('createV5', () => {
      it('creates V5 checkpoint with full state', async () => {
        // Create V5 state with nodes, edges, props
        const state = createEmptyState();
        const dot1 = Dot.create('alice', 1);
        const dot2 = Dot.create('alice', 2);
        state.nodeAlive.add('n1', dot1);
        state.nodeAlive.add('n2', dot2);
        state.edgeAlive.add(encodeEdgeKeyV5('n1', 'n2', 'link'), Dot.create('alice', 3));
        state.prop.set(encodePropKeyV5('n1', 'name'), {
          eventId: { lamport: 1, writerId: 'alice', patchSha: makeOid('p1'), opIndex: 0 },
          value: { type: 'inline', value: 'Node1' },
        });

        const frontier = createFrontier();
        updateFrontier(frontier, 'alice', makeOid('sha1'));

        // Track written blobs
                const writtenBlobs: any[] = [];
        mockPersistence.writeBlob.mockImplementation((buffer) => {
          writtenBlobs.push(buffer);
          return Promise.resolve(makeOid(`blob${writtenBlobs.length}`));
        });
        mockPersistence.writeTree.mockResolvedValue(makeOid('tree'));
        mockPersistence.commitNodeWithTree.mockResolvedValue(makeOid('checkpoint'));

        await createV5({
          persistence: mockPersistence,
          graphName: 'test',
          state,
          frontier,
          crypto,
        });

        // Verify 3 blobs were written (state, frontier, appliedVV)
        expect(mockPersistence.writeBlob).toHaveBeenCalledTimes(3);

        // Verify tree has all 3 entries
        const treeEntries = mockPersistence.writeTree.mock.calls[0][0];
        expect(treeEntries).toHaveLength(3);
        expect(treeEntries.some((e) => e.includes('state.cbor'))).toBe(true);
        expect(treeEntries.some((e) => e.includes('frontier.cbor'))).toBe(true);
        expect(treeEntries.some((e) => e.includes('appliedVV.cbor'))).toBe(true);

        // Verify schema 2 in message
        const messageArg = mockPersistence.commitNodeWithTree.mock.calls[0][0].message;
        const decoded = decodeCheckpointMessage(messageArg);
        expect(decoded.schema).toBe(2);
      });

      it('compacts tombstoned dots when compact=true', async () => {
        const state = createEmptyState();
        const dot = Dot.create('alice', 1);
        state.nodeAlive.add('deleted', dot);
        state.nodeAlive.remove(new Set([encodeDot(dot)]));

        const frontier = createFrontier();
        updateFrontier(frontier, 'alice', makeOid('sha1'));

                let capturedStateBuffer: any;
        mockPersistence.writeBlob.mockImplementation((buffer) => {
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
        const restoredState = deserializeFullState(capturedStateBuffer);
        // After compaction, the tombstoned entry should be removed
        expect(restoredState.nodeAlive.entries.has('deleted')).toBe(false);
        expect(restoredState.nodeAlive.tombstones.size).toBe(0);
      });

      it('preserves tombstoned dots when compact=false', async () => {
        const state = createEmptyState();
        const dot = Dot.create('alice', 1);
        state.nodeAlive.add('deleted', dot);
        state.nodeAlive.remove(new Set([encodeDot(dot)]));

        const frontier = createFrontier();
        updateFrontier(frontier, 'alice', makeOid('sha1'));

                let capturedStateBuffer: any;
        mockPersistence.writeBlob.mockImplementation((buffer) => {
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
        const restoredState = deserializeFullState(capturedStateBuffer);
        expect(restoredState.nodeAlive.entries.has('deleted')).toBe(true);
        expect(restoredState.nodeAlive.tombstones.has('alice:1')).toBe(true);
      });

      it('anchors unique content blobs in sorted tree order for node and edge content', async () => {
        const state = createEmptyState();
        state.nodeAlive.add('n1', Dot.create('alice', 1));
        state.nodeAlive.add('n2', Dot.create('alice', 2));
        state.edgeAlive.add(encodeEdgeKeyV5('n1', 'n2', 'link'), Dot.create('alice', 3));

        const sharedOid = makeOid('contenta');
        const edgeOid = makeOid('contentb');

        state.prop.set(encodePropKeyV5('n1', CONTENT_PROPERTY_KEY), {
          eventId: { lamport: 1, writerId: 'alice', patchSha: makeOid('patch1'), opIndex: 0 },
          value: sharedOid,
        });
        state.prop.set(encodePropKeyV5('n2', CONTENT_PROPERTY_KEY), {
          eventId: { lamport: 2, writerId: 'alice', patchSha: makeOid('patch2'), opIndex: 0 },
          value: sharedOid,
        });
        state.prop.set(encodeEdgePropKey('n1', 'n2', 'link', CONTENT_PROPERTY_KEY), {
          eventId: { lamport: 3, writerId: 'alice', patchSha: makeOid('patch3'), opIndex: 0 },
          value: edgeOid,
        });
        state.prop.set(encodePropKeyV5('n1', 'label'), {
          eventId: { lamport: 4, writerId: 'alice', patchSha: makeOid('patch4'), opIndex: 0 },
          value: 'ignore-me',
        });

        const frontier = createFrontier();
        updateFrontier(frontier, 'alice', makeOid('sha1'));

        let blobIndex = 0;
        mockPersistence.writeBlob.mockImplementation(() => Promise.resolve(makeOid(`blob${blobIndex++}`)));
        mockPersistence.writeTree.mockResolvedValue(makeOid('tree'));
        mockPersistence.commitNodeWithTree.mockResolvedValue(makeOid('checkpoint'));

        await createV5({
          persistence: mockPersistence,
          graphName: 'test',
          state,
          frontier,
          crypto,
        });

        const treeEntries = mockPersistence.writeTree.mock.calls[0][0];
        expect(treeEntries).toEqual([
          `040000 tree ${sharedOid}\t_content_${sharedOid}`,
          `040000 tree ${edgeOid}\t_content_${edgeOid}`,
          expect.stringContaining('\tappliedVV.cbor'),
          expect.stringContaining('\tfrontier.cbor'),
          expect.stringContaining('\tstate.cbor'),
        ]);
      });

      it('anchors large content sets without duplicate entries when batch flushes occur', async () => {
        const state = createEmptyState();
        const frontier = createFrontier();
        updateFrontier(frontier, 'alice', makeOid('sha1'));

        for (let i = 0; i < 300; i++) {
          const nodeId = `n${i}`;
          state.nodeAlive.add(nodeId, Dot.create('alice', i + 1));
          const contentOid = makeSequentialOid(i);
          state.prop.set(encodePropKeyV5(nodeId, CONTENT_PROPERTY_KEY), {
            eventId: {
              lamport: i + 1,
              writerId: 'alice',
              patchSha: makeOid(`patch${String(i).padStart(3, '0')}`),
              opIndex: 0,
            },
            value: contentOid,
          });
        }

        state.prop.set(encodePropKeyV5('n0', 'name'), {
          eventId: { lamport: 301, writerId: 'alice', patchSha: makeOid('patchname'), opIndex: 0 },
          value: 'not-content',
        });
        state.edgeAlive.add(encodeEdgeKeyV5('n0', 'n1', 'dup'), Dot.create('alice', 301));
        state.prop.set(encodeEdgePropKey('n0', 'n1', 'dup', CONTENT_PROPERTY_KEY), {
          eventId: { lamport: 302, writerId: 'alice', patchSha: makeOid('patchdup'), opIndex: 0 },
          value: makeSequentialOid(0),
        });

        mockPersistence.writeBlob.mockResolvedValue(makeOid('blob'));
        mockPersistence.writeTree.mockResolvedValue(makeOid('tree'));
        mockPersistence.commitNodeWithTree.mockResolvedValue(makeOid('checkpoint'));

        await createV5({
          persistence: mockPersistence,
          graphName: 'test',
          state,
          frontier,
          crypto,
        });

        const treeEntries = mockPersistence.writeTree.mock.calls[0][0];
        const contentEntries = treeEntries.filter((entry) => entry.includes('\t_content_'));
        expect(contentEntries).toHaveLength(300);
        expect(contentEntries[0]).toBe(`040000 tree ${makeSequentialOid(0)}\t_content_${makeSequentialOid(0)}`);
        expect(contentEntries[299]).toBe(`040000 tree ${makeSequentialOid(299)}\t_content_${makeSequentialOid(299)}`);
      });

      it('merges reversed content-anchor batches into sorted unique output', async () => {
        const state = createEmptyState();
        const frontier = createFrontier();
        updateFrontier(frontier, 'alice', makeOid('sha1'));

        for (let i = 0; i < 256; i++) {
          const nodeId = `high-${i}`;
          state.nodeAlive.add(nodeId, Dot.create('alice', i + 1));
          const contentOid = makeSequentialOid(300 + i);
          state.prop.set(encodePropKeyV5(nodeId, CONTENT_PROPERTY_KEY), {
            eventId: {
              lamport: i + 1,
              writerId: 'alice',
              patchSha: makeOid(`high${String(i).padStart(3, '0')}`),
              opIndex: 0,
            },
            value: contentOid,
          });
        }

        for (let i = 0; i < 10; i++) {
          const nodeId = `low-${i}`;
          state.nodeAlive.add(nodeId, Dot.create('alice', 400 + i));
          const contentOid = makeSequentialOid(i);
          state.prop.set(encodePropKeyV5(nodeId, CONTENT_PROPERTY_KEY), {
            eventId: {
              lamport: 400 + i,
              writerId: 'alice',
              patchSha: makeOid(`low${String(i).padStart(3, '0')}`),
              opIndex: 0,
            },
            value: contentOid,
          });
        }

        mockPersistence.writeBlob.mockResolvedValue(makeOid('blob'));
        mockPersistence.writeTree.mockResolvedValue(makeOid('tree'));
        mockPersistence.commitNodeWithTree.mockResolvedValue(makeOid('checkpoint'));

        await createV5({
          persistence: mockPersistence,
          graphName: 'test',
          state,
          frontier,
          crypto,
        });

        const treeEntries = mockPersistence.writeTree.mock.calls[0][0];
        const contentEntries = treeEntries.filter((entry) => entry.includes('\t_content_'));
        expect(contentEntries[0]).toBe(`040000 tree ${makeSequentialOid(0)}\t_content_${makeSequentialOid(0)}`);
        expect(contentEntries[9]).toBe(`040000 tree ${makeSequentialOid(9)}\t_content_${makeSequentialOid(9)}`);
        expect(contentEntries[10]).toBe(`040000 tree ${makeSequentialOid(300)}\t_content_${makeSequentialOid(300)}`);
      });
    });

    describe('loadCheckpoint for V5', () => {
      it('loads V5 checkpoint with full ORSet state', async () => {
        // Create and serialize V5 state
        const originalState = createEmptyState();
        const dot1 = Dot.create('alice', 1);
        const dot2 = Dot.create('bob', 2);
        originalState.nodeAlive.add('x', dot1);
        originalState.nodeAlive.add('y', dot2);
        originalState.edgeAlive.add(encodeEdgeKeyV5('x', 'y', 'conn'), Dot.create('alice', 3));
        originalState.prop.set(encodePropKeyV5('x', 'val'), {
          eventId: { lamport: 5, writerId: 'alice', patchSha: makeOid('p'), opIndex: 0 },
          value: { type: 'inline', value: 42 },
        });

        const frontier = createFrontier();
        updateFrontier(frontier, 'alice', makeOid('sha1'));

        // Serialize buffers
        const stateBuffer = serializeFullState(originalState);
        const frontierBuffer = serializeFrontier(frontier);
        const appliedVV = computeAppliedVV(originalState);
        const appliedVVBuffer = serializeAppliedVV(appliedVV);
        const stateHash = await computeStateHash(originalState, { crypto });

        const treeOid = makeOid('tree');
        const stateBlobOid = makeOid('state');
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
          'frontier.cbor': frontierBlobOid,
          'appliedVV.cbor': appliedVVBlobOid,
        });
        mockPersistence.readBlob.mockImplementation((oid) => {
          if (oid === stateBlobOid) return Promise.resolve(stateBuffer);
          if (oid === frontierBlobOid) return Promise.resolve(frontierBuffer);
          if (oid === appliedVVBlobOid) return Promise.resolve(appliedVVBuffer);
          throw new Error(`Unknown oid: ${oid}`);
        });

        const result: any = await loadCheckpoint(mockPersistence, makeOid('checkpoint'));

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

      it('ignores _content_ anchor entries when loading a checkpoint tree', async () => {
        const originalState = createEmptyState();
        originalState.nodeAlive.add('x', Dot.create('alice', 1));

        const frontier = createFrontier();
        updateFrontier(frontier, 'alice', makeOid('sha1'));

        const stateBuffer = serializeFullState(originalState);
        const frontierBuffer = serializeFrontier(frontier);
        const appliedVVBuffer = serializeAppliedVV(computeAppliedVV(originalState));
        const stateHash = await computeStateHash(originalState, { crypto });

        const treeOid = makeOid('tree');
        const stateBlobOid = makeOid('state');
        const frontierBlobOid = makeOid('frontier');
        const appliedVVBlobOid = makeOid('appliedvv');
        const contentAnchorOid = makeOid('content');

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
          [`_content_${contentAnchorOid}`]: contentAnchorOid,
          'state.cbor': stateBlobOid,
          'frontier.cbor': frontierBlobOid,
          'appliedVV.cbor': appliedVVBlobOid,
        });
        mockPersistence.readBlob.mockImplementation((oid) => {
          if (oid === stateBlobOid) return Promise.resolve(stateBuffer);
          if (oid === frontierBlobOid) return Promise.resolve(frontierBuffer);
          if (oid === appliedVVBlobOid) return Promise.resolve(appliedVVBuffer);
          throw new Error(`Unexpected blob read: ${oid}`);
        });

        const result = await loadCheckpoint(mockPersistence, makeOid('checkpoint'));

        expect(result.state.nodeAlive.entries.has('x')).toBe(true);
        expect(mockPersistence.readBlob).not.toHaveBeenCalledWith(contentAnchorOid);
      });

      it('loads V5 checkpoint without appliedVV for backward compatibility', async () => {
        // Create V5 state
        const originalState = createEmptyState();
        originalState.nodeAlive.add('a', Dot.create('w1', 1));

        const frontier = createFrontier();
        updateFrontier(frontier, 'w1', makeOid('sha1'));

        const stateBuffer = serializeFullState(originalState);
        const frontierBuffer = serializeFrontier(frontier);
        const stateHash = await computeStateHash(originalState, { crypto });

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
        mockPersistence.readBlob.mockImplementation((oid) => {
          if (oid === stateBlobOid) return Promise.resolve(stateBuffer);
          if (oid === frontierBlobOid) return Promise.resolve(frontierBuffer);
          throw new Error(`Unknown oid: ${oid}`);
        });

        const result: any = await loadCheckpoint(mockPersistence, makeOid('checkpoint'));

        expect(result.schema).toBe(2);
        expect(result.state.nodeAlive.entries.has('a')).toBe(true);
        expect(result.appliedVV).toBeNull();
      });
    });

    describe('V5 checkpoint roundtrip', () => {
      it('create -> loadCheckpoint preserves full state', async () => {
        // Build V5 state with various elements
        const state = createEmptyState();
        const aliceDot1 = Dot.create('alice', 1);
        const aliceDot2 = Dot.create('alice', 2);
        const bobDot1 = Dot.create('bob', 1);

        state.nodeAlive.add('n1', aliceDot1);
        state.nodeAlive.add('n2', aliceDot2);
        state.nodeAlive.add('n3', bobDot1);
        state.edgeAlive.add(encodeEdgeKeyV5('n1', 'n2', 'follows'), Dot.create('alice', 3));
        state.edgeAlive.add(encodeEdgeKeyV5('n2', 'n3', 'knows'), Dot.create('bob', 2));

        state.prop.set(encodePropKeyV5('n1', 'name'), {
          eventId: { lamport: 10, writerId: 'alice', patchSha: makeOid('p1'), opIndex: 0 },
          value: { type: 'inline', value: 'Alice' },
        });

        const frontier = createFrontier();
        updateFrontier(frontier, 'alice', makeOid('sha1'));
        updateFrontier(frontier, 'bob', makeOid('sha2'));

        // Capture written data during create
        let writtenStateBlob;
        let writtenFrontierBlob;
        let writtenAppliedVVBlob;
                let writtenMessage: any;
        let blobIndex = 0;

        mockPersistence.writeBlob.mockImplementation((buffer) => {
          switch (blobIndex++) {
            case 0:
              writtenStateBlob = buffer;
              return Promise.resolve(makeOid('stateOid'));
            case 1:
              writtenFrontierBlob = buffer;
              return Promise.resolve(makeOid('frontierOid'));
            case 2:
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
        await create(({
          persistence: mockPersistence,
          graphName: 'roundtrip-v5',
          state,
          frontier,
          schema: 2,
          compact: false, // Don't compact to preserve all state
          crypto,
        } as any));

        // Setup mocks for loading
        mockPersistence.showNode.mockResolvedValue(writtenMessage);
        mockPersistence.getNodeInfo.mockResolvedValue({ sha: makeOid('checkpointSha') });
        mockPersistence.readTreeOids.mockResolvedValue({
          'state.cbor': makeOid('stateOid'),
          'frontier.cbor': makeOid('frontierOid'),
          'appliedVV.cbor': makeOid('appliedVVOid'),
        });
        mockPersistence.readBlob.mockImplementation((oid) => {
          if (oid === makeOid('stateOid')) return Promise.resolve(writtenStateBlob);
          if (oid === makeOid('frontierOid')) return Promise.resolve(writtenFrontierBlob);
          if (oid === makeOid('appliedVVOid')) return Promise.resolve(writtenAppliedVVBlob);
          throw new Error(`Unknown oid: ${oid}`);
        });

        // Load checkpoint
        const loaded: any = await loadCheckpoint(mockPersistence, makeOid('checkpointSha'));

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

    });

    describe('appliedVV correctness', () => {
      it('appliedVV is computed and saved correctly', async () => {
        const state = createEmptyState();
        // Add various dots
        state.nodeAlive.add('a', Dot.create('alice', 5));
        state.nodeAlive.add('b', Dot.create('alice', 3));
        state.nodeAlive.add('c', Dot.create('bob', 7));
        state.edgeAlive.add(encodeEdgeKeyV5('a', 'b', 'x'), Dot.create('alice', 10));

        const frontier = createFrontier();
        updateFrontier(frontier, 'alice', makeOid('sha1'));
        updateFrontier(frontier, 'bob', makeOid('sha2'));

                let capturedAppliedVVBlob: any;
        let blobIndex = 0;
        mockPersistence.writeBlob.mockImplementation((buffer) => {
          if (blobIndex === 2) {
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

  describe('schema 4 (index subtree)', () => {
    it('creates schema:4 checkpoint when indexTree is provided', async () => {
      const state = createEmptyState();
      const dot = Dot.create('writer1', 1);
      state.nodeAlive.add('x', dot);

      const frontier = createFrontier();
      updateFrontier(frontier, 'writer1', makeOid('aaa'));

      const blobStore = new Map();
      let blobCounter = 0;
      mockPersistence.writeBlob.mockImplementation((buf) => {
        const oid = makeOid(`b${String(blobCounter++).padStart(3, '0')}`);
        blobStore.set(oid, buf);
        return Promise.resolve(oid);
      });

      const treeOids = new Map();
      let treeCounter = 0;
      mockPersistence.writeTree.mockImplementation((entries) => {
        const oid = makeOid(`t${String(treeCounter++).padStart(3, '0')}`);
        treeOids.set(oid, entries);
        return Promise.resolve(oid);
      });

      mockPersistence.commitNodeWithTree.mockResolvedValue(makeOid('ccc'));

      // Simulate an index tree with a few shards
      const indexTree = {
        'meta_ab.cbor': Buffer.from('meta-data'),
        'fwd_cd.cbor': Buffer.from('fwd-data'),
      };

      await createV5({
        persistence: mockPersistence,
        graphName: 'test',
        state,
        frontier,
        crypto,
        indexTree,
      });

      // writeTree called twice: once for index subtree, once for main tree
      expect(mockPersistence.writeTree).toHaveBeenCalledTimes(2);

      // First call = index subtree
      const subtreeEntries = mockPersistence.writeTree.mock.calls[0][0];
      expect(subtreeEntries.length).toBe(2);
      for (const entry of subtreeEntries) {
        expect(entry).toMatch(/^100644 blob/);
      }

      // Second call = main tree containing 040000 tree entry for index
      const mainEntries = mockPersistence.writeTree.mock.calls[1][0];
      const indexEntry = mainEntries.find((e) => e.includes('\tindex'));
      expect(indexEntry).toBeDefined();
      expect(indexEntry).toMatch(/^040000 tree/);

      // Commit message has schema:4
      const commitArgs = mockPersistence.commitNodeWithTree.mock.calls[0][0];
      expect(commitArgs.message).toContain('eg-schema: 4');
    });

    it('loads schema:4 checkpoint with indexShardOids', async () => {
      const state = createEmptyState();
      const dot = Dot.create('writer1', 1);
      state.nodeAlive.add('x', dot);

      const frontier = createFrontier();
      updateFrontier(frontier, 'writer1', makeOid('aaa'));

      // Encode checkpoint message with schema:4
      const stateHash = await computeStateHash(state, { crypto });
      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash,
        frontierOid: makeOid('frontier'),
        indexOid: makeOid('tree'),
        schema: 4,
      });

      mockPersistence.showNode.mockResolvedValue(message);

      // readTreeOids returns flat entries — ls-tree -r recurses into subtrees
      const stateBlob = serializeFullState(state);
      const frontierBlob = serializeFrontier(frontier);
      const appliedVVBlob = serializeAppliedVV(computeAppliedVV(state));

      mockPersistence.readTreeOids.mockResolvedValue({
        'state.cbor': makeOid('state'),
        'frontier.cbor': makeOid('frontier'),
        'appliedVV.cbor': makeOid('appliedvv'),
        'index/meta_ab.cbor': makeOid('idxmeta'),
        'index/fwd_cd.cbor': makeOid('idxfwd'),
      });

      mockPersistence.readBlob.mockImplementation((oid) => {
        if (oid === makeOid('state')) { return Promise.resolve(stateBlob); }
        if (oid === makeOid('frontier')) { return Promise.resolve(frontierBlob); }
        if (oid === makeOid('appliedvv')) { return Promise.resolve(appliedVVBlob); }
        return Promise.resolve(Buffer.alloc(0));
      });

      const result = await loadCheckpoint(mockPersistence, makeOid('checkpoint'));

      expect(result.schema).toBe(4);
      expect(result.indexShardOids).not.toBeNull();
      if (!result.indexShardOids) { throw new Error('expected indexShardOids'); }
      expect(result.indexShardOids['meta_ab.cbor']).toBe(makeOid('idxmeta'));
      expect(result.indexShardOids['fwd_cd.cbor']).toBe(makeOid('idxfwd'));
    });

    it('returns null indexShardOids for schema:2 checkpoints', async () => {
      const state = createEmptyState();
      const dot = Dot.create('writer1', 1);
      state.nodeAlive.add('x', dot);

      const frontier = createFrontier();
      updateFrontier(frontier, 'writer1', makeOid('aaa'));

      const stateHash = await computeStateHash(state, { crypto });
      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash,
        frontierOid: makeOid('frontier'),
        indexOid: makeOid('tree'),
        schema: 2,
      });

      mockPersistence.showNode.mockResolvedValue(message);

      const stateBlob = serializeFullState(state);
      const frontierBlob = serializeFrontier(frontier);
      const appliedVVBlob = serializeAppliedVV(computeAppliedVV(state));

      mockPersistence.readTreeOids.mockResolvedValue({
        'state.cbor': makeOid('state'),
        'frontier.cbor': makeOid('frontier'),
        'appliedVV.cbor': makeOid('appliedvv'),
      });

      mockPersistence.readBlob.mockImplementation((oid) => {
        if (oid === makeOid('state')) { return Promise.resolve(stateBlob); }
        if (oid === makeOid('frontier')) { return Promise.resolve(frontierBlob); }
        if (oid === makeOid('appliedvv')) { return Promise.resolve(appliedVVBlob); }
        return Promise.resolve(Buffer.alloc(0));
      });

      const result = await loadCheckpoint(mockPersistence, makeOid('checkpoint'));

      expect(result.schema).toBe(2);
      expect(result.indexShardOids).toBeNull();
    });
  });
});
