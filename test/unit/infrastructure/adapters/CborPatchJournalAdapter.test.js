import { describe, it, expect, vi } from 'vitest';
import { CborPatchJournalAdapter } from '../../../../src/infrastructure/adapters/CborPatchJournalAdapter.js';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.js';
import { createPatchV2 } from '../../../../src/domain/types/WarpTypesV2.js';
import PatchJournalPort from '../../../../src/ports/PatchJournalPort.js';

/**
 * Golden fixture: a known PatchV2 encoded with the canonical CBOR codec.
 * If this test breaks, the wire format changed — investigate before fixing.
 */
const GOLDEN_PATCH = createPatchV2({
  schema: 2,
  writer: 'alice',
  lamport: 1,
  context: { alice: 0 },
  ops: [
    { type: 'NodeAdd', id: 'user:alice', dot: ['alice', 1] },
    { type: 'PropSet', node: 'user:alice', key: 'name', value: 'Alice' },
  ],
  reads: [],
  writes: ['user:alice'],
});

const GOLDEN_HEX =
  'b9000767636f6e74657874b9000165616c69636500676c616d706f727401636f707382b9000363646f748265616c696365016269646a757365723a616c6963656474797065674e6f6465416464b90004636b6579646e616d65646e6f64656a757365723a616c69636564747970656750726f705365746576616c756565416c696365657265616473f766736368656d61026677726974657265616c69636566777269746573816a757365723a616c696365';

/**
 * Creates an in-memory BlobPort stub that stores blobs in a Map.
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

describe('CborPatchJournalAdapter', () => {
  it('extends PatchJournalPort', () => {
    const codec = new CborCodec();
    const blobPort = createMemoryBlobPort();
    const adapter = new CborPatchJournalAdapter({ codec, blobPort });
    expect(adapter).toBeInstanceOf(PatchJournalPort);
  });

  it('writePatch returns a string OID', async () => {
    const codec = new CborCodec();
    const blobPort = createMemoryBlobPort();
    const adapter = new CborPatchJournalAdapter({ codec, blobPort });

    const oid = await adapter.writePatch(GOLDEN_PATCH);
    expect(typeof oid).toBe('string');
    expect(oid.length).toBeGreaterThan(0);
  });

  it('readPatch returns the same PatchV2 object', async () => {
    const codec = new CborCodec();
    const blobPort = createMemoryBlobPort();
    const adapter = new CborPatchJournalAdapter({ codec, blobPort });

    const oid = await adapter.writePatch(GOLDEN_PATCH);
    const result = await adapter.readPatch(oid);

    expect(result.schema).toBe(2);
    expect(result.writer).toBe('alice');
    expect(result.lamport).toBe(1);
    expect(result.ops).toHaveLength(2);
    expect(result.ops[0].type).toBe('NodeAdd');
    expect(result.ops[1].type).toBe('PropSet');
    expect(result.writes).toEqual(['user:alice']);
  });

  describe('golden fixture (wire format stability)', () => {
    it('produces byte-identical output to the known golden hex', async () => {
      const codec = new CborCodec();
      const blobPort = createMemoryBlobPort();
      const adapter = new CborPatchJournalAdapter({ codec, blobPort });

      await adapter.writePatch(GOLDEN_PATCH);
      const storedBytes = blobPort.store.values().next().value;
      const storedHex = Array.from(storedBytes).map(
        (/** @type {number} */ b) => b.toString(16).padStart(2, '0'),
      ).join('');

      expect(storedHex).toBe(GOLDEN_HEX);
    });

    it('round-trips the golden bytes back to the same domain object', async () => {
      const codec = new CborCodec();
      const goldenBytes = new Uint8Array(
        GOLDEN_HEX.match(/.{2}/g).map((/** @type {string} */ h) => parseInt(h, 16)),
      );
      const blobPort = createMemoryBlobPort();
      blobPort.store.set('golden', goldenBytes);
      const adapter = new CborPatchJournalAdapter({ codec, blobPort });

      const result = await adapter.readPatch('golden');
      expect(result.schema).toBe(2);
      expect(result.writer).toBe('alice');
      expect(result.ops).toHaveLength(2);
    });
  });

  describe('encrypted patch support', () => {
    it('uses patchBlobStorage when provided for writePatch', async () => {
      const codec = new CborCodec();
      const blobPort = createMemoryBlobPort();
      const patchBlobStorage = {
        store: vi.fn().mockResolvedValue('encrypted_oid'),
        retrieve: vi.fn(),
      };
      const adapter = new CborPatchJournalAdapter({ codec, blobPort, patchBlobStorage });

      const oid = await adapter.writePatch(GOLDEN_PATCH);
      expect(oid).toBe('encrypted_oid');
      expect(patchBlobStorage.store).toHaveBeenCalledOnce();
      expect(blobPort.writeBlob).not.toHaveBeenCalled();
    });

    it('uses patchBlobStorage for readPatch when encrypted flag is set', async () => {
      const codec = new CborCodec();
      const blobPort = createMemoryBlobPort();
      const goldenBytes = codec.encode(GOLDEN_PATCH);
      const patchBlobStorage = {
        store: vi.fn(),
        retrieve: vi.fn().mockResolvedValue(goldenBytes),
      };
      const adapter = new CborPatchJournalAdapter({ codec, blobPort, patchBlobStorage });

      const result = await adapter.readPatch('some_oid', { encrypted: true });
      expect(result.writer).toBe('alice');
      expect(patchBlobStorage.retrieve).toHaveBeenCalledWith('some_oid');
      expect(blobPort.readBlob).not.toHaveBeenCalled();
    });
  });
});
