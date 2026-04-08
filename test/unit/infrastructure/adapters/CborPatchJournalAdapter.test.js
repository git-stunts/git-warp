import { describe, it, expect, vi } from 'vitest';
import { CborPatchJournalAdapter } from '../../../../src/infrastructure/adapters/CborPatchJournalAdapter.js';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.js';
import { createPatchV2 } from '../../../../src/domain/types/WarpTypesV2.ts';
import PatchJournalPort from '../../../../src/ports/PatchJournalPort.ts';

/**
 * Golden fixture: a known PatchV2 encoded with the canonical CBOR codec.
 * If this test breaks, the wire format changed — investigate before fixing.
 *
 * Note: ops use tuple form `['alice', 1]` for dot — this is the wire format
 * that CBOR (de)serializes. The domain typedef uses Dot class, but the codec
 * boundary handles the tuple ↔ Dot mapping.
 */
const GOLDEN_PATCH = createPatchV2({
  schema: 2,
  writer: 'alice',
  lamport: 1,
  context: { alice: 0 },
  ops: /** @type {import('../../../../src/domain/types/WarpTypesV2.ts').OpV2[]} */ ([
    { type: 'NodeAdd', id: 'user:alice', dot: ['alice', 1] },
    { type: 'PropSet', node: 'user:alice', key: 'name', value: 'Alice' },
  ]),
  reads: [],
  writes: ['user:alice'],
});

const GOLDEN_HEX =
  'b9000767636f6e74657874b9000165616c69636500676c616d706f727401636f707382b9000363646f748265616c696365016269646a757365723a616c6963656474797065674e6f6465416464b90004636b6579646e616d65646e6f64656a757365723a616c69636564747970656750726f705365746576616c756565416c696365657265616473f766736368656d61026677726974657265616c69636566777269746573816a757365723a616c696365';

import MockBlobPort from '../../../helpers/MockBlobPort.js';
import BlobStoragePort from '../../../../src/ports/BlobStoragePort.ts';

/**
 * Creates an in-memory BlobPort backed by MockBlobPort.
 * @returns {MockBlobPort}
 */
function createMemoryBlobPort() {
  return new MockBlobPort();
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
    expect(/** @type {NonNullable<(typeof result.ops)[0]>} */ (result.ops[0]).type).toBe('NodeAdd');
    expect(/** @type {NonNullable<(typeof result.ops)[0]>} */ (result.ops[1]).type).toBe('PropSet');
    expect(result.writes).toEqual(['user:alice']);
  });

  describe('golden fixture (wire format stability)', () => {
    it('produces byte-identical output to the known golden hex', async () => {
      const codec = new CborCodec();
      const blobPort = createMemoryBlobPort();
      const adapter = new CborPatchJournalAdapter({ codec, blobPort });

      await adapter.writePatch(GOLDEN_PATCH);
      const storedBytes = /** @type {Uint8Array} */ (blobPort.store.values().next().value);
      const storedHex = Array.from(storedBytes).map(
        (/** @type {number} */ b) => b.toString(16).padStart(2, '0'),
      ).join('');

      expect(storedHex).toBe(GOLDEN_HEX);
    });

    it('round-trips the golden bytes back to the same domain object', async () => {
      const codec = new CborCodec();
      const hexPairs = /** @type {string[]} */ (GOLDEN_HEX.match(/.{2}/g));
      const goldenBytes = new Uint8Array(
        hexPairs.map((h) => parseInt(h, 16)),
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
    /**
     * Creates a mock BlobStoragePort with vitest spies.
     * @param {{ storeResult?: string, retrieveResult?: Uint8Array }} [opts]
     * @returns {BlobStoragePort}
     */
    function createMockBlobStorage(opts = {}) {
      const mock = new BlobStoragePort();
      mock.store = vi.fn().mockResolvedValue(opts.storeResult ?? 'encrypted_oid');
      mock.retrieve = vi.fn().mockResolvedValue(opts.retrieveResult ?? new Uint8Array(0));
      mock.storeStream = vi.fn();
      mock.retrieveStream = vi.fn();
      return mock;
    }

    it('uses patchBlobStorage when provided for writePatch', async () => {
      const codec = new CborCodec();
      const blobPort = createMemoryBlobPort();
      const patchBlobStorage = createMockBlobStorage({ storeResult: 'encrypted_oid' });
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
      const patchBlobStorage = createMockBlobStorage({ retrieveResult: goldenBytes });
      const adapter = new CborPatchJournalAdapter({ codec, blobPort, patchBlobStorage });

      const result = await adapter.readPatch('some_oid', { encrypted: true });
      expect(result.writer).toBe('alice');
      expect(patchBlobStorage.retrieve).toHaveBeenCalledWith('some_oid');
      expect(blobPort.readBlob).not.toHaveBeenCalled();
    });
  });
});
