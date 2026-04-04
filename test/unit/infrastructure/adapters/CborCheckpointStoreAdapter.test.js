import { describe, it, expect, vi } from 'vitest';
import { CborCheckpointStoreAdapter } from '../../../../src/infrastructure/adapters/CborCheckpointStoreAdapter.js';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.js';
import CheckpointStorePort from '../../../../src/ports/CheckpointStorePort.js';
import { createORSet, orsetAdd } from '../../../../src/domain/crdt/ORSet.js';
import { createVersionVector } from '../../../../src/domain/crdt/VersionVector.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';

/**
 * Golden fixture: a known checkpoint state encoded with the canonical CBOR codec.
 * If these tests break, the wire format changed — investigate before fixing.
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

const GOLDEN_STATE_HEX =
  'b900066965646765416c697665b9000267656e747269657381827819757365723a616c69636500757365723a626f62006b6e6f7773816477313a336a746f6d6273746f6e6573806e6564676542697274684576656e7480696e6f6465416c697665b9000267656e747269657382826a757365723a616c696365816477313a318268757365723a626f62816477313a326a746f6d6273746f6e657380706f6273657276656446726f6e74696572b90001627731036470726f7081826f757365723a616c696365006e616d65b90002676576656e744964b90004676c616d706f727401676f70496e646578006870617463685368617828616161616161616161616161616161616161616161616161616161616161616161616161616161616877726974657249646277316576616c756565416c6963656776657273696f6e6766756c6c2d7635';

const GOLDEN_VV_HEX = 'b9000162773103';
const GOLDEN_FRONTIER_HEX = 'b9000162773166616263313233';

/**
 * Creates an in-memory BlobPort stub.
 * @returns {{ writeBlob: Function, readBlob: Function, store: Map<string, Uint8Array> }}
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

/** @returns {{ hash: Function }} */
function createMockCrypto() {
  return {
    hash: vi.fn(async (/** @type {string} */ _algo, /** @type {Uint8Array} */ _data) => 'deadbeef'.repeat(8)),
  };
}

describe('CborCheckpointStoreAdapter', () => {
  it('extends CheckpointStorePort', () => {
    const adapter = new CborCheckpointStoreAdapter({
      codec: new CborCodec(),
      blobPort: createMemoryBlobPort(),
      crypto: createMockCrypto(),
    });
    expect(adapter).toBeInstanceOf(CheckpointStorePort);
  });

  describe('state round-trip', () => {
    it('writeState returns a string OID', async () => {
      const blobPort = createMemoryBlobPort();
      const adapter = new CborCheckpointStoreAdapter({
        codec: new CborCodec(), blobPort, crypto: createMockCrypto(),
      });
      const oid = await adapter.writeState(createGoldenState());
      expect(typeof oid).toBe('string');
      expect(oid.length).toBeGreaterThan(0);
    });

    it('readState reconstructs a WarpStateV5-compatible object', async () => {
      const blobPort = createMemoryBlobPort();
      const adapter = new CborCheckpointStoreAdapter({
        codec: new CborCodec(), blobPort, crypto: createMockCrypto(),
      });
      const oid = await adapter.writeState(createGoldenState());
      const state = await adapter.readState(oid);

      // Verify OR-Set contents
      expect(state.nodeAlive).toBeDefined();
      expect(state.edgeAlive).toBeDefined();
      expect(state.prop).toBeInstanceOf(Map);
      expect(state.observedFrontier).toBeDefined();
    });
  });

  describe('appliedVV round-trip', () => {
    it('round-trips a VersionVector', async () => {
      const blobPort = createMemoryBlobPort();
      const adapter = new CborCheckpointStoreAdapter({
        codec: new CborCodec(), blobPort, crypto: createMockCrypto(),
      });
      const vv = createVersionVector();
      vv.set('w1', 3);

      const oid = await adapter.writeAppliedVV(vv);
      const result = await adapter.readAppliedVV(oid);
      expect(result.get('w1')).toBe(3);
    });
  });

  describe('frontier round-trip', () => {
    it('round-trips a frontier Map', async () => {
      const blobPort = createMemoryBlobPort();
      const adapter = new CborCheckpointStoreAdapter({
        codec: new CborCodec(), blobPort, crypto: createMockCrypto(),
      });
      const frontier = new Map([['w1', 'abc123']]);

      const oid = await adapter.writeFrontier(frontier);
      const result = await adapter.readFrontier(oid);
      expect(result.get('w1')).toBe('abc123');
    });
  });

  describe('computeStateHash', () => {
    it('returns a hex string', async () => {
      const blobPort = createMemoryBlobPort();
      const adapter = new CborCheckpointStoreAdapter({
        codec: new CborCodec(), blobPort, crypto: createMockCrypto(),
      });
      const hash = await adapter.computeStateHash(createGoldenState());
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });
  });

  describe('golden fixtures (wire format stability)', () => {
    it('writeState produces byte-identical output to golden hex', async () => {
      const blobPort = createMemoryBlobPort();
      const adapter = new CborCheckpointStoreAdapter({
        codec: new CborCodec(), blobPort, crypto: createMockCrypto(),
      });
      await adapter.writeState(createGoldenState());
      const storedBytes = blobPort.store.values().next().value;
      const storedHex = Array.from(storedBytes).map(
        (/** @type {number} */ b) => b.toString(16).padStart(2, '0'),
      ).join('');
      expect(storedHex).toBe(GOLDEN_STATE_HEX);
    });

    it('writeAppliedVV produces byte-identical output to golden hex', async () => {
      const blobPort = createMemoryBlobPort();
      const adapter = new CborCheckpointStoreAdapter({
        codec: new CborCodec(), blobPort, crypto: createMockCrypto(),
      });
      const vv = createVersionVector();
      vv.set('w1', 3);
      await adapter.writeAppliedVV(vv);
      const storedBytes = blobPort.store.values().next().value;
      const storedHex = Array.from(storedBytes).map(
        (/** @type {number} */ b) => b.toString(16).padStart(2, '0'),
      ).join('');
      expect(storedHex).toBe(GOLDEN_VV_HEX);
    });

    it('writeFrontier produces byte-identical output to golden hex', async () => {
      const blobPort = createMemoryBlobPort();
      const adapter = new CborCheckpointStoreAdapter({
        codec: new CborCodec(), blobPort, crypto: createMockCrypto(),
      });
      const frontier = new Map([['w1', 'abc123']]);
      await adapter.writeFrontier(frontier);
      const storedBytes = blobPort.store.values().next().value;
      const storedHex = Array.from(storedBytes).map(
        (/** @type {number} */ b) => b.toString(16).padStart(2, '0'),
      ).join('');
      expect(storedHex).toBe(GOLDEN_FRONTIER_HEX);
    });
  });
});
