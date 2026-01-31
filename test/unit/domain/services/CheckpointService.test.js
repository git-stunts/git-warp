import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create, loadCheckpoint, materializeIncremental } from '../../../../src/domain/services/CheckpointService.js';
import { createFrontier, updateFrontier, serializeFrontier, deserializeFrontier } from '../../../../src/domain/services/Frontier.js';
import { serializeState, deserializeState, computeStateHash } from '../../../../src/domain/services/StateSerializer.js';
import { createEmptyState, reduce, encodeEdgeKey, encodePropKey } from '../../../../src/domain/services/Reducer.js';
import { encodeCheckpointMessage, decodeCheckpointMessage } from '../../../../src/domain/services/WarpMessageCodec.js';
import { createPatch, createNodeAdd, createEdgeAdd, createPropSet, createInlineValue } from '../../../../src/domain/types/WarpTypes.js';
import { lwwValue } from '../../../../src/domain/crdt/LWW.js';

// Helper to create valid 40-char hex OIDs for testing
const makeOid = (prefix) => {
  const base = prefix.replace(/[^0-9a-f]/gi, '0').toLowerCase();
  return (base + '0'.repeat(40)).slice(0, 40);
};

describe('CheckpointService', () => {
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
    it('creates checkpoint commit with state and frontier blobs', async () => {
      // Setup test data
      const state = createEmptyState();
      state.nodeAlive.set('x', { eventId: { lamport: 1, writerId: 'w', patchSha: makeOid('abc123'), opIndex: 0 }, value: true });

      const frontier = createFrontier();
      updateFrontier(frontier, 'writer1', makeOid('sha123'));

      // Setup mock returns with valid OIDs
      const stateBlobOid = makeOid('aaa111');
      const frontierBlobOid = makeOid('bbb222');
      const treeOid = makeOid('ccc333');
      const checkpointOid = makeOid('ddd444');

      mockPersistence.writeBlob.mockResolvedValueOnce(stateBlobOid);
      mockPersistence.writeBlob.mockResolvedValueOnce(frontierBlobOid);
      mockPersistence.writeTree.mockResolvedValue(treeOid);
      mockPersistence.commitNodeWithTree.mockResolvedValue(checkpointOid);

      // Execute
      const checkpointSha = await create({
        persistence: mockPersistence,
        graphName: 'test-graph',
        state,
        frontier,
      });

      // Verify
      expect(checkpointSha).toBe(checkpointOid);
      expect(mockPersistence.writeBlob).toHaveBeenCalledTimes(2);
      expect(mockPersistence.writeTree).toHaveBeenCalledTimes(1);
      expect(mockPersistence.commitNodeWithTree).toHaveBeenCalledTimes(1);
    });

    it('creates tree entries in sorted order', async () => {
      const state = createEmptyState();
      const frontier = createFrontier();

      // First writeBlob call is for state, second is for frontier
      const stateOid = makeOid('aaa111'); // starts with 'aaa'
      const frontierOid = makeOid('bbb222'); // starts with 'bbb'
      mockPersistence.writeBlob.mockResolvedValueOnce(stateOid);
      mockPersistence.writeBlob.mockResolvedValueOnce(frontierOid);
      mockPersistence.writeTree.mockResolvedValue(makeOid('tree'));
      mockPersistence.commitNodeWithTree.mockResolvedValue(makeOid('sha'));

      await create({
        persistence: mockPersistence,
        graphName: 'test',
        state,
        frontier,
      });

      // Tree entries should be sorted by filename (frontier.cbor < state.cbor alphabetically)
      const treeEntries = mockPersistence.writeTree.mock.calls[0][0];
      expect(treeEntries).toHaveLength(2);
      expect(treeEntries[0]).toContain('frontier.cbor');
      expect(treeEntries[0]).toContain(frontierOid);
      expect(treeEntries[1]).toContain('state.cbor');
      expect(treeEntries[1]).toContain(stateOid);
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
      });

      expect(mockPersistence.commitNodeWithTree).toHaveBeenCalledWith(
        expect.objectContaining({
          parents: [makeOid('parent1'), makeOid('parent2')],
        })
      );
    });

    it('encodes checkpoint message with correct trailers', async () => {
      const state = createEmptyState();
      const frontier = createFrontier();

      const stateBlobOid = 'aabbccdd00112233445566778899aabbccddeeff';
      const frontierBlobOid = 'ffeeddcc00112233445566778899aabbccddeeff';
      const treeOid = '1122334400112233445566778899aabbccddeeff';

      mockPersistence.writeBlob.mockResolvedValueOnce(stateBlobOid);
      mockPersistence.writeBlob.mockResolvedValueOnce(frontierBlobOid);
      mockPersistence.writeTree.mockResolvedValue(treeOid);
      mockPersistence.commitNodeWithTree.mockResolvedValue(makeOid('sha'));

      await create({
        persistence: mockPersistence,
        graphName: 'my-graph',
        state,
        frontier,
        schema: 1,
      });

      const messageArg = mockPersistence.commitNodeWithTree.mock.calls[0][0].message;
      const decoded = decodeCheckpointMessage(messageArg);

      expect(decoded.kind).toBe('checkpoint');
      expect(decoded.graph).toBe('my-graph');
      expect(decoded.schema).toBe(1);
      expect(decoded.frontierOid).toBe(frontierBlobOid);
      expect(decoded.indexOid).toBe(treeOid);
    });
  });

  describe('loadCheckpoint', () => {
    it('loads checkpoint state and frontier from commit', async () => {
      // Create test data
      const originalState = {
        nodes: ['node1', 'node2'],
        edges: [{ from: 'node1', to: 'node2', label: 'link' }],
        props: [{ node: 'node1', key: 'name', value: { type: 'inline', value: 'test' } }],
      };

      const originalFrontier = createFrontier();
      updateFrontier(originalFrontier, 'writer1', makeOid('sha111'));

      // Serialize for mock returns
      const stateBuffer = serializeState(
        // Create a WarpState that serializes to originalState
        createStateFromProjection(originalState)
      );
      const frontierBuffer = serializeFrontier(originalFrontier);
      const stateHash = computeStateHash(createStateFromProjection(originalState));

      const frontierOid = makeOid('frontierOid');
      const treeOid = makeOid('treeOid');
      const frontierBlobOid = makeOid('frontierBlob');
      const stateBlobOid = makeOid('stateBlob');

      // Setup mock checkpoint message
      const message = encodeCheckpointMessage({
        graph: 'test-graph',
        stateHash,
        frontierOid,
        indexOid: treeOid,
        schema: 1,
      });

      mockPersistence.showNode.mockResolvedValue(message);
      mockPersistence.getNodeInfo.mockResolvedValue({ sha: makeOid('checkpointSha') });
      mockPersistence.readTreeOids.mockResolvedValue({
        'frontier.cbor': frontierBlobOid,
        'state.cbor': stateBlobOid,
      });
      mockPersistence.readBlob.mockImplementation((oid) => {
        if (oid === frontierBlobOid) return Promise.resolve(frontierBuffer);
        if (oid === stateBlobOid) return Promise.resolve(stateBuffer);
        throw new Error(`Unknown oid: ${oid}`);
      });

      // Execute
      const result = await loadCheckpoint(mockPersistence, makeOid('checkpointSha'));

      // Verify
      expect(result.stateHash).toBe(stateHash);
      expect(result.schema).toBe(1);
      expect(result.frontier.get('writer1')).toBe(makeOid('sha111'));
      expect(result.state.nodes).toContain('node1');
      expect(result.state.nodes).toContain('node2');
    });

    it('throws if frontier.cbor is missing', async () => {
      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash: 'a'.repeat(64),
        frontierOid: 'a'.repeat(40),
        indexOid: 'b'.repeat(40),
        schema: 1,
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
        schema: 1,
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
  });

  describe('materializeIncremental', () => {
    it('returns checkpoint state when no new patches', async () => {
      // Setup checkpoint data
      const checkpointState = {
        nodes: ['existing'],
        edges: [],
        props: [],
      };
      const sha1 = makeOid('sha1');
      const checkpointFrontier = createFrontier();
      updateFrontier(checkpointFrontier, 'writer1', sha1);

      const stateBuffer = serializeState(createStateFromProjection(checkpointState));
      const frontierBuffer = serializeFrontier(checkpointFrontier);
      const stateHash = computeStateHash(createStateFromProjection(checkpointState));

      const frontierOid = makeOid('frontierOid');
      const treeOid = makeOid('treeOid');
      const frontierBlobOid = makeOid('frontierBlob');
      const stateBlobOid = makeOid('stateBlob');

      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash,
        frontierOid,
        indexOid: treeOid,
        schema: 1,
      });

      mockPersistence.showNode.mockResolvedValue(message);
      mockPersistence.getNodeInfo.mockResolvedValue({ sha: makeOid('checkpointSha') });
      mockPersistence.readTreeOids.mockResolvedValue({
        'frontier.cbor': frontierBlobOid,
        'state.cbor': stateBlobOid,
      });
      mockPersistence.readBlob.mockImplementation((oid) => {
        if (oid === frontierBlobOid) return Promise.resolve(frontierBuffer);
        if (oid === stateBlobOid) return Promise.resolve(stateBuffer);
        throw new Error(`Unknown oid: ${oid}`);
      });

      // Target frontier is same as checkpoint frontier
      const targetFrontier = createFrontier();
      updateFrontier(targetFrontier, 'writer1', sha1);

      const patchLoader = vi.fn().mockResolvedValue([]);

      // Execute
      const result = await materializeIncremental({
        persistence: mockPersistence,
        graphName: 'test',
        checkpointSha: makeOid('checkpointSha'),
        targetFrontier,
        patchLoader,
      });

      // Verify
      expect(lwwValue(result.nodeAlive.get('existing'))).toBe(true);
    });

    it('applies new patches on top of checkpoint state', async () => {
      // Setup checkpoint with node 'a'
      const checkpointState = {
        nodes: ['a'],
        edges: [],
        props: [],
      };
      const sha1 = makeOid('sha1');
      const sha2 = makeOid('sha2');
      const checkpointFrontier = createFrontier();
      updateFrontier(checkpointFrontier, 'writer1', sha1);

      const stateBuffer = serializeState(createStateFromProjection(checkpointState));
      const frontierBuffer = serializeFrontier(checkpointFrontier);
      const stateHash = computeStateHash(createStateFromProjection(checkpointState));

      const frontierOid = makeOid('frontierOid');
      const treeOid = makeOid('treeOid');
      const frontierBlobOid = makeOid('frontierBlob');
      const stateBlobOid = makeOid('stateBlob');

      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash,
        frontierOid,
        indexOid: treeOid,
        schema: 1,
      });

      mockPersistence.showNode.mockResolvedValue(message);
      mockPersistence.getNodeInfo.mockResolvedValue({ sha: makeOid('checkpointSha') });
      mockPersistence.readTreeOids.mockResolvedValue({
        'frontier.cbor': frontierBlobOid,
        'state.cbor': stateBlobOid,
      });
      mockPersistence.readBlob.mockImplementation((oid) => {
        if (oid === frontierBlobOid) return Promise.resolve(frontierBuffer);
        if (oid === stateBlobOid) return Promise.resolve(stateBuffer);
        throw new Error(`Unknown oid: ${oid}`);
      });

      // Target frontier has advanced
      const targetFrontier = createFrontier();
      updateFrontier(targetFrontier, 'writer1', sha2);

      // New patch adds node 'b'
      const newPatch = createPatch({
        writer: 'writer1',
        lamport: 2,
        ops: [createNodeAdd('b')],
      });

      const patchLoader = vi.fn().mockResolvedValue([{ patch: newPatch, sha: makeOid('sha2abcd') }]);

      // Execute
      const result = await materializeIncremental({
        persistence: mockPersistence,
        graphName: 'test',
        checkpointSha: makeOid('checkpointSha'),
        targetFrontier,
        patchLoader,
      });

      // Verify both nodes exist
      expect(lwwValue(result.nodeAlive.get('a'))).toBe(true);
      expect(lwwValue(result.nodeAlive.get('b'))).toBe(true);
    });

    it('handles new writers not in checkpoint frontier', async () => {
      // Setup checkpoint with writer1 only
      const checkpointState = {
        nodes: ['x'],
        edges: [],
        props: [],
      };
      const sha1 = makeOid('sha1');
      const sha2 = makeOid('sha2');
      const checkpointFrontier = createFrontier();
      updateFrontier(checkpointFrontier, 'writer1', sha1);

      const stateBuffer = serializeState(createStateFromProjection(checkpointState));
      const frontierBuffer = serializeFrontier(checkpointFrontier);
      const stateHash = computeStateHash(createStateFromProjection(checkpointState));

      const frontierOid = makeOid('frontierOid');
      const treeOid = makeOid('treeOid');
      const frontierBlobOid = makeOid('frontierBlob');
      const stateBlobOid = makeOid('stateBlob');

      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash,
        frontierOid,
        indexOid: treeOid,
        schema: 1,
      });

      mockPersistence.showNode.mockResolvedValue(message);
      mockPersistence.getNodeInfo.mockResolvedValue({ sha: makeOid('checkpointSha') });
      mockPersistence.readTreeOids.mockResolvedValue({
        'frontier.cbor': frontierBlobOid,
        'state.cbor': stateBlobOid,
      });
      mockPersistence.readBlob.mockImplementation((oid) => {
        if (oid === frontierBlobOid) return Promise.resolve(frontierBuffer);
        if (oid === stateBlobOid) return Promise.resolve(stateBuffer);
        throw new Error(`Unknown oid: ${oid}`);
      });

      // Target frontier includes new writer2
      const targetFrontier = createFrontier();
      updateFrontier(targetFrontier, 'writer1', sha1);
      updateFrontier(targetFrontier, 'writer2', sha2);

      // Patches from both writers
      const patch2 = createPatch({
        writer: 'writer2',
        lamport: 1,
        ops: [createNodeAdd('y')],
      });

      const patchLoader = vi.fn().mockImplementation((writerId, fromSha, toSha) => {
        if (writerId === 'writer1') return Promise.resolve([]);
        if (writerId === 'writer2') return Promise.resolve([{ patch: patch2, sha: makeOid('sha2abcd') }]);
        return Promise.resolve([]);
      });

      // Execute
      const result = await materializeIncremental({
        persistence: mockPersistence,
        graphName: 'test',
        checkpointSha: makeOid('checkpointSha'),
        targetFrontier,
        patchLoader,
      });

      // Verify
      expect(lwwValue(result.nodeAlive.get('x'))).toBe(true);
      expect(lwwValue(result.nodeAlive.get('y'))).toBe(true);
    });

    it('calls patchLoader with correct arguments', async () => {
      const checkpointState = {
        nodes: [],
        edges: [],
        props: [],
      };
      const checkpointSha1 = makeOid('checkpointSha1');
      const checkpointFrontier = createFrontier();
      updateFrontier(checkpointFrontier, 'writer1', checkpointSha1);

      const stateBuffer = serializeState(createStateFromProjection(checkpointState));
      const frontierBuffer = serializeFrontier(checkpointFrontier);
      const stateHash = computeStateHash(createStateFromProjection(checkpointState));

      const frontierOid = makeOid('frontierOid');
      const treeOid = makeOid('treeOid');
      const frontierBlobOid = makeOid('frontierBlob');
      const stateBlobOid = makeOid('stateBlob');

      const message = encodeCheckpointMessage({
        graph: 'test',
        stateHash,
        frontierOid,
        indexOid: treeOid,
        schema: 1,
      });

      mockPersistence.showNode.mockResolvedValue(message);
      mockPersistence.getNodeInfo.mockResolvedValue({ sha: makeOid('checkpointSha') });
      mockPersistence.readTreeOids.mockResolvedValue({
        'frontier.cbor': frontierBlobOid,
        'state.cbor': stateBlobOid,
      });
      mockPersistence.readBlob.mockImplementation((oid) => {
        if (oid === frontierBlobOid) return Promise.resolve(frontierBuffer);
        if (oid === stateBlobOid) return Promise.resolve(stateBuffer);
        throw new Error(`Unknown oid: ${oid}`);
      });

      const targetSha1 = makeOid('targetSha1');
      const targetSha2 = makeOid('targetSha2');
      const targetFrontier = createFrontier();
      updateFrontier(targetFrontier, 'writer1', targetSha1);
      updateFrontier(targetFrontier, 'writer2', targetSha2);

      const patchLoader = vi.fn().mockResolvedValue([]);

      await materializeIncremental({
        persistence: mockPersistence,
        graphName: 'test',
        checkpointSha: makeOid('checkpointSha'),
        targetFrontier,
        patchLoader,
      });

      // Verify patchLoader was called correctly
      expect(patchLoader).toHaveBeenCalledWith('writer1', checkpointSha1, targetSha1);
      expect(patchLoader).toHaveBeenCalledWith('writer2', null, targetSha2); // writer2 not in checkpoint
    });
  });

  describe('roundtrip', () => {
    it('create -> loadCheckpoint preserves data', async () => {
      // Build state using reduce
      const patchSha = makeOid('patchSha1234');
      const patch = createPatch({
        writer: 'alice',
        lamport: 1,
        ops: [
          createNodeAdd('n1'),
          createNodeAdd('n2'),
          createEdgeAdd('n1', 'n2', 'follows'),
          createPropSet('n1', 'name', createInlineValue('Alice')),
        ],
      });
      const state = reduce([{ patch, sha: patchSha }]);

      const frontier = createFrontier();
      updateFrontier(frontier, 'alice', patchSha);

      // Capture written data
      let writtenStateBlob;
      let writtenFrontierBlob;
      let writtenTreeOid;
      let writtenMessage;

      const stateBlobOid = makeOid('stateOid');
      const frontierBlobOid = makeOid('frontierOid');
      const treeOid = makeOid('treeOid');
      const checkpointOid = makeOid('checkpointSha');

      mockPersistence.writeBlob.mockImplementation((buffer) => {
        // First call is state, second is frontier
        if (!writtenStateBlob) {
          writtenStateBlob = buffer;
          return Promise.resolve(stateBlobOid);
        } else {
          writtenFrontierBlob = buffer;
          return Promise.resolve(frontierBlobOid);
        }
      });
      mockPersistence.writeTree.mockImplementation((entries) => {
        writtenTreeOid = treeOid;
        return Promise.resolve(writtenTreeOid);
      });
      mockPersistence.commitNodeWithTree.mockImplementation(({ message }) => {
        writtenMessage = message;
        return Promise.resolve(checkpointOid);
      });

      // Create checkpoint
      await create({
        persistence: mockPersistence,
        graphName: 'roundtrip-test',
        state,
        frontier,
      });

      // Setup mocks for loading
      mockPersistence.showNode.mockResolvedValue(writtenMessage);
      mockPersistence.getNodeInfo.mockResolvedValue({ sha: checkpointOid });
      mockPersistence.readTreeOids.mockResolvedValue({
        'frontier.cbor': frontierBlobOid,
        'state.cbor': stateBlobOid,
      });
      mockPersistence.readBlob.mockImplementation((oid) => {
        if (oid === frontierBlobOid) {
          return Promise.resolve(writtenFrontierBlob);
        }
        if (oid === stateBlobOid) {
          return Promise.resolve(writtenStateBlob);
        }
        throw new Error(`Unknown oid: ${oid}`);
      });

      // Load checkpoint
      const loaded = await loadCheckpoint(mockPersistence, checkpointOid);

      // Verify roundtrip preserved data
      expect(loaded.state.nodes).toContain('n1');
      expect(loaded.state.nodes).toContain('n2');
      expect(loaded.state.edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ from: 'n1', to: 'n2', label: 'follows' }),
        ])
      );
      expect(loaded.state.props).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            node: 'n1',
            key: 'name',
            value: { type: 'inline', value: 'Alice' },
          }),
        ])
      );
      expect(loaded.frontier.get('alice')).toBe(patchSha);
    });
  });
});

/**
 * Helper to create WarpState from visible projection.
 * Used for testing serialization.
 */
function createStateFromProjection({ nodes, edges, props }) {
  const syntheticEventId = {
    lamport: 1,
    writerId: '__test__',
    patchSha: 'a'.repeat(40),
    opIndex: 0,
  };

  const nodeAlive = new Map();
  const edgeAlive = new Map();
  const prop = new Map();

  for (const nodeId of nodes) {
    nodeAlive.set(nodeId, { eventId: syntheticEventId, value: true });
  }

  for (const edge of edges) {
    const edgeKey = `${edge.from}\0${edge.to}\0${edge.label}`;
    edgeAlive.set(edgeKey, { eventId: syntheticEventId, value: true });
  }

  for (const p of props) {
    const propKey = `${p.node}\0${p.key}`;
    prop.set(propKey, { eventId: syntheticEventId, value: p.value });
  }

  return { nodeAlive, edgeAlive, prop };
}
