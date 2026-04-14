import { describe, it, expect, vi } from 'vitest';
import { CborPatchJournalAdapter } from '../../../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import EncryptionError from '../../../../src/domain/errors/EncryptionError.ts';
import SyncError from '../../../../src/domain/errors/SyncError.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import { encodePatchMessage } from '../../../../src/domain/services/codec/PatchMessageCodec.ts';

/** @param {Record<string, unknown>} opts */
function createPatch(opts) { return new Patch((opts)); }
import PatchJournalPort from '../../../../src/ports/PatchJournalPort.ts';

/**
 * Golden fixture: a known Patch encoded with the canonical CBOR codec.
 * If this test breaks, the wire format changed — investigate before fixing.
 *
 * Note: ops use tuple form `['alice', 1]` for dot — this is the wire format
 * that CBOR (de)serializes. The domain typedef uses Dot class, but the codec
 * boundary handles the tuple ↔ Dot mapping.
 */
const GOLDEN_PATCH = createPatch({
  schema: 2,
  writer: 'alice',
  lamport: 1,
  context: { alice: 0 },
  ops: (([
    { type: 'NodeAdd', id: 'user:alice', dot: ['alice', 1] },
    { type: 'PropSet', node: 'user:alice', key: 'name', value: 'Alice' },
  ]) as any),
  reads: [],
  writes: ['user:alice'],
});

const GOLDEN_HEX =
  'b9000767636f6e74657874b9000165616c69636500676c616d706f727401636f707382b9000363646f748265616c696365016269646a757365723a616c6963656474797065674e6f6465416464b90004636b6579646e616d65646e6f64656a757365723a616c69636564747970656750726f705365746576616c756565416c696365657265616473f766736368656d61026677726974657265616c69636566777269746573816a757365723a616c696365';

import MockBlobPort from '../../../helpers/MockBlobPort.ts';
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

  it('rejects missing required dependencies', () => {
    const codec = new CborCodec();
    const blobPort = createMemoryBlobPort();

    expect(() => new CborPatchJournalAdapter(({ blobPort } as any))).toThrow('CborPatchJournalAdapter requires a codec');
    expect(() => new CborPatchJournalAdapter(({ codec } as any))).toThrow('CborPatchJournalAdapter requires a blobPort');
  });

  it('writePatch returns a string OID', async () => {
    const codec = new CborCodec();
    const blobPort = createMemoryBlobPort();
    const adapter = new CborPatchJournalAdapter({ codec, blobPort });

    const oid = await adapter.writePatch(GOLDEN_PATCH);
    expect(typeof oid).toBe('string');
    expect(oid.length).toBeGreaterThan(0);
  });

  it('readPatch returns the same Patch object', async () => {
    const codec = new CborCodec();
    const blobPort = createMemoryBlobPort();
    const adapter = new CborPatchJournalAdapter({ codec, blobPort });

    const oid = await adapter.writePatch(GOLDEN_PATCH);
    const result = await adapter.readPatch(oid);
    const [firstOp, secondOp] = result.ops;

    expect(result.schema).toBe(2);
    expect(result.writer).toBe('alice');
    expect(result.lamport).toBe(1);
    expect(result.ops).toHaveLength(2);
    expect(firstOp).toBeInstanceOf(NodeAdd);
    if (!(firstOp instanceof NodeAdd)) {
      throw new Error('expected NodeAdd');
    }
    expect(firstOp.type).toBe('NodeAdd');
    expect(firstOp.dot).toBeInstanceOf(Dot);
    expect(firstOp.node).toBe('user:alice');
    expect(secondOp?.type).toBe('PropSet');
    expect(result.writes).toEqual(['user:alice']);
  });

  describe('golden fixture (wire format stability)', () => {
    it('produces byte-identical output to the known golden hex', async () => {
      const codec = new CborCodec();
      const blobPort = createMemoryBlobPort();
      const adapter = new CborPatchJournalAdapter({ codec, blobPort });

      await adapter.writePatch(GOLDEN_PATCH);
      const storedBytes = (blobPort.store.values().next().value as Uint8Array);
      const storedHex = Array.from(storedBytes).map(
        (/** @type {number} */ b) => b.toString(16).padStart(2, '0'),
      ).join('');

      expect(storedHex).toBe(GOLDEN_HEX);
    });

    it('round-trips the golden bytes back to the same domain object', async () => {
      const codec = new CborCodec();
      const hexPairs = (GOLDEN_HEX.match(/.{2}/g) as string[]);
      const goldenBytes = new Uint8Array(
        hexPairs.map((h) => parseInt(h, 16)),
      );
      const blobPort = createMemoryBlobPort();
      blobPort.store.set('golden', goldenBytes);
      const adapter = new CborPatchJournalAdapter({ codec, blobPort });

      const result = await adapter.readPatch('golden');
      const [firstOp] = result.ops;
      expect(result.schema).toBe(2);
      expect(result.writer).toBe('alice');
      expect(result.ops).toHaveLength(2);
      expect(firstOp).toBeInstanceOf(NodeAdd);
      if (!(firstOp instanceof NodeAdd)) {
        throw new Error('expected NodeAdd');
      }
      expect(firstOp.dot).toBeInstanceOf(Dot);
    });
  });

  describe('encrypted patch support', () => {
    /**
     * Creates a mock BlobStoragePort with vitest spies.
     * @param {{ storeResult?: string, retrieveResult?: Uint8Array }} [opts]
     * @returns {BlobStoragePort}
     */
    function createMockBlobStorage(opts = {}) {
      const mock = ((({
        store: vi.fn().mockResolvedValue((opts as any).storeResult ?? 'encrypted_oid'),
        retrieve: vi.fn().mockResolvedValue((opts as any).retrieveResult ?? new Uint8Array(0)),
        storeStream: vi.fn(),
        retrieveStream: vi.fn(),
      })) as BlobStoragePort);
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

    it('reports whether external storage is configured', () => {
      const codec = new CborCodec();
      const blobPort = createMemoryBlobPort();
      const plainAdapter = new CborPatchJournalAdapter({ codec, blobPort });
      const encryptedAdapter = new CborPatchJournalAdapter({
        codec,
        blobPort,
        patchBlobStorage: createMockBlobStorage(),
      });

      expect(plainAdapter.usesExternalStorage).toBe(false);
      expect(encryptedAdapter.usesExternalStorage).toBe(true);
    });

    it('rejects encrypted reads when no patchBlobStorage is configured', async () => {
      const codec = new CborCodec();
      const blobPort = createMemoryBlobPort();
      const adapter = new CborPatchJournalAdapter({ codec, blobPort });

      await expect(adapter.readPatch('encrypted_oid', { encrypted: true })).rejects.toBeInstanceOf(EncryptionError);
    });
  });

  describe('scanPatchRange', () => {
    it('requires a commitPort', async () => {
      const codec = new CborCodec();
      const blobPort = createMemoryBlobPort();
      const adapter = new CborPatchJournalAdapter({ codec, blobPort });

      await expect(adapter.scanPatchRange('alice', null, 'sha-1').collect()).rejects.toBeInstanceOf(SyncError);
    });

    it('yields hydrated patches in chronological order', async () => {
      const codec = new CborCodec();
      const blobPort = createMemoryBlobPort();
      const patch1 = createPatch({
        schema: 2,
        writer: 'alice',
        lamport: 1,
        context: { alice: 0 },
        ops: [{ type: 'NodeAdd', id: 'n1', dot: ['alice', 1] }],
      });
      const patch2 = createPatch({
        schema: 2,
        writer: 'alice',
        lamport: 2,
        context: { alice: 1 },
        ops: [{ type: 'NodeAdd', id: 'n2', dot: ['alice', 2] }],
      });
      const patchOid1 = 'a'.repeat(40);
      const patchOid2 = 'b'.repeat(40);
      blobPort.store.set(patchOid1, codec.encode(patch1));
      blobPort.store.set(patchOid2, codec.encode(patch2));
      const commitPort = {
        getNodeInfo: vi.fn()
          .mockResolvedValueOnce({
            message: encodePatchMessage({
              graph: 'test',
              writer: 'alice',
              lamport: 2,
              patchOid: patchOid2,
            }),
            parents: ['sha-1'],
          })
          .mockResolvedValueOnce({
            message: encodePatchMessage({
              graph: 'test',
              writer: 'alice',
              lamport: 1,
              patchOid: patchOid1,
            }),
            parents: [],
          }),
      };
      const adapter = new CborPatchJournalAdapter({ codec, blobPort, commitPort });

      const entries = await adapter.scanPatchRange('alice', null, 'sha-2').collect();

      expect(entries).toHaveLength(2);
      expect(entries.map((entry) => entry.sha)).toEqual(['sha-1', 'sha-2']);
      expect(entries[0]?.patch.ops[0]).toBeInstanceOf(NodeAdd);
      expect(entries[1]?.patch.ops[0]).toBeInstanceOf(NodeAdd);
    });

    it('detects divergence when the expected ancestor is not reached', async () => {
      const codec = new CborCodec();
      const blobPort = createMemoryBlobPort();
      const patchOid = 'c'.repeat(40);
      blobPort.store.set(patchOid, codec.encode(GOLDEN_PATCH));
      const commitPort = {
        getNodeInfo: vi.fn().mockResolvedValue({
          message: encodePatchMessage({
            graph: 'test',
            writer: 'alice',
            lamport: 1,
            patchOid,
          }),
          parents: [],
        }),
      };
      const adapter = new CborPatchJournalAdapter({ codec, blobPort, commitPort });

      await expect(adapter.scanPatchRange('alice', 'sha-root', 'sha-1').collect()).rejects.toBeInstanceOf(SyncError);
    });

    it('stops scanning when a non-patch commit is encountered', async () => {
      const codec = new CborCodec();
      const blobPort = createMemoryBlobPort();
      const commitPort = {
        getNodeInfo: vi.fn().mockResolvedValue({
          message: 'checkpoint message',
          parents: ['sha-parent'],
        }),
      };
      const adapter = new CborPatchJournalAdapter({ codec, blobPort, commitPort });

      const entries = await adapter.scanPatchRange('alice', null, 'sha-stop').collect();

      expect(entries).toEqual([]);
    });
  });
});
