import { describe, it, expect, vi } from 'vitest';
import { CborCheckpointStoreAdapter } from '../../../../src/infrastructure/adapters/CborCheckpointStoreAdapter.js';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.js';
import CheckpointStorePort from '../../../../src/ports/CheckpointStorePort.js';
import { createORSet, orsetAdd } from '../../../../src/domain/crdt/ORSet.js';
import { createVersionVector } from '../../../../src/domain/crdt/VersionVector.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';

/**
 * Builds a small but representative checkpoint state.
 */
function createGoldenState() {
  const nodeAlive = createORSet();
  orsetAdd(nodeAlive, 'user:alice', createDot('w1', 1));
  orsetAdd(nodeAlive, 'user:bob', createDot('w1', 2));

  const edgeAlive = createORSet();
  orsetAdd(edgeAlive, 'user:alice\x00user:bob\x00knows', createDot('w1', 3));

  const prop = new Map();
  prop.set('user:alice\x00name', {
    eventId: { lamport: 1, writerId: 'w1', patchSha: 'a'.repeat(40), opIndex: 0 },
    value: 'Alice',
  });

  const observedFrontier = createVersionVector();
  observedFrontier.set('w1', 3);

  return { nodeAlive, edgeAlive, prop, observedFrontier };
}

/**
 * Creates an in-memory BlobPort stub.
 */
function createMemoryBlobPort() {
  /** @type {Map<string, Uint8Array>} */
  const store = new Map();
  let counter = 0;
  return {
    store,
    writeBlob: vi.fn(async (/** @type {Uint8Array} */ content) => {
      const oid = `blob_${String(counter++).padStart(40, '0')}`;
      store.set(oid, content);
      return oid;
    }),
    readBlob: vi.fn(async (/** @type {string} */ oid) => {
      const data = store.get(oid);
      if (!data) { throw new Error(`Blob not found: ${oid}`); }
      return data;
    }),
  };
}

describe('CborCheckpointStoreAdapter (collapsed)', () => {
  it('extends CheckpointStorePort', () => {
    const adapter = new CborCheckpointStoreAdapter({
      codec: new CborCodec(), blobPort: createMemoryBlobPort(),
    });
    expect(adapter).toBeInstanceOf(CheckpointStorePort);
  });

  describe('writeCheckpoint', () => {
    it('returns OIDs for state, frontier, appliedVV', async () => {
      const blobPort = createMemoryBlobPort();
      const adapter = new CborCheckpointStoreAdapter({
        codec: new CborCodec(), blobPort,
      });

      const vv = createVersionVector();
      vv.set('w1', 3);

      const result = await adapter.writeCheckpoint({
        state: createGoldenState(),
        frontier: new Map([['w1', 'abc123']]),
        appliedVV: vv,
        stateHash: 'deadbeef',
      });

      expect(typeof result.stateBlobOid).toBe('string');
      expect(typeof result.frontierBlobOid).toBe('string');
      expect(typeof result.appliedVVBlobOid).toBe('string');
      expect(result.provenanceIndexBlobOid).toBeNull();
      expect(blobPort.writeBlob).toHaveBeenCalledTimes(3);
    });

    it('writes 4 blobs when provenanceIndex is provided', async () => {
      const blobPort = createMemoryBlobPort();
      const adapter = new CborCheckpointStoreAdapter({
        codec: new CborCodec(), blobPort,
      });

      const { ProvenanceIndex } = await import('../../../../src/domain/services/provenance/ProvenanceIndex.js');
      const provIndex = new ProvenanceIndex();

      const vv = createVersionVector();

      const result = await adapter.writeCheckpoint({
        state: createGoldenState(),
        frontier: new Map(),
        appliedVV: vv,
        stateHash: 'deadbeef',
        provenanceIndex: provIndex,
      });

      expect(result.provenanceIndexBlobOid).not.toBeNull();
      expect(blobPort.writeBlob).toHaveBeenCalledTimes(4);
    });
  });

  describe('readCheckpoint', () => {
    it('round-trips state, frontier, appliedVV', async () => {
      const blobPort = createMemoryBlobPort();
      const codec = new CborCodec();
      const adapter = new CborCheckpointStoreAdapter({ codec, blobPort });

      const vv = createVersionVector();
      vv.set('w1', 3);

      const writeResult = await adapter.writeCheckpoint({
        state: createGoldenState(),
        frontier: new Map([['w1', 'abc123']]),
        appliedVV: vv,
        stateHash: 'deadbeef',
      });

      const treeOids = {
        'state.cbor': writeResult.stateBlobOid,
        'frontier.cbor': writeResult.frontierBlobOid,
        'appliedVV.cbor': writeResult.appliedVVBlobOid,
      };

      const data = await adapter.readCheckpoint(treeOids);

      expect(data.state).toBeDefined();
      expect(data.state.nodeAlive).toBeDefined();
      expect(data.frontier.get('w1')).toBe('abc123');
      expect(data.appliedVV).not.toBeNull();
      expect(data.appliedVV.get('w1')).toBe(3);
    });

    it('throws on missing state.cbor', async () => {
      const adapter = new CborCheckpointStoreAdapter({
        codec: new CborCodec(), blobPort: createMemoryBlobPort(),
      });
      await expect(adapter.readCheckpoint({})).rejects.toThrow('missing state.cbor');
    });
  });
});
