import { describe, it, expect, vi } from 'vitest';
import { CborPatchJournalAdapter } from '../../../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import EncryptionError from '../../../../src/domain/errors/EncryptionError.ts';
import SyncError from '../../../../src/domain/errors/SyncError.ts';
import { reducePatches } from '../../../../src/domain/services/JoinReducer.ts';
import { hydrateDecodedPatch } from '../../../../src/domain/services/PatchHydrator.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';
import { encodePatchMessage } from '../../../../src/domain/services/codec/PatchMessageCodec.ts';
import PatchJournalPort from '../../../../src/ports/PatchJournalPort.ts';
import BlobStoragePort from '../../../../src/ports/BlobStoragePort.ts';
import type { BlobStorageOptions } from '../../../../src/ports/BlobStoragePort.ts';
import MockBlobPort from '../../../helpers/MockBlobPort.ts';

/**
 * Golden fixture: a known Patch encoded with the canonical CBOR codec.
 * If this test breaks, the wire format changed — investigate before fixing.
 *
 * Note: ops use tuple form `['alice', 1]` for dot — this is the wire format
 * that CBOR (de)serializes. The domain typedef uses Dot class, but the codec
 * boundary handles the tuple ↔ Dot mapping.
 */
const GOLDEN_PATCH = hydrateDecodedPatch({
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
  'b9000767636f6e74657874b9000165616c69636500676c616d706f727401636f707382b9000563646f74b9000267636f756e7465720168777269746572496465616c696365646e6f64656a757365723a616c6963656b726563656970744e616d65674e6f64654164646573636f7065036474797065674e6f6465416464b90006636b6579646e616d65646e6f64656a757365723a616c6963656b726563656970744e616d656750726f705365746573636f70650264747970656750726f705365746576616c756565416c696365657265616473f766736368656d61026677726974657265616c69636566777269746573816a757365723a616c696365';

/**
 * Creates an in-memory BlobPort backed by MockBlobPort.
 * @returns {MockBlobPort}
 */
function createMemoryBlobPort() {
  return new MockBlobPort();
}

function createPatch(opts: ConstructorParameters<typeof Patch>[0]): Patch {
  return new Patch(opts);
}

function hexToBytes(hex: string): Uint8Array {
  const hexPairs = hex.match(/.{2}/g);
  if (hexPairs === null) {
    throw new Error('golden hex must contain bytes');
  }
  return new Uint8Array(hexPairs.map((h) => parseInt(h, 16)));
}

function storedBlobBytes(blobPort: MockBlobPort): Uint8Array {
  const stored = blobPort.store.values().next();
  if (stored.done === true || !(stored.value instanceof Uint8Array)) {
    throw new Error('expected one stored Uint8Array blob');
  }
  return stored.value;
}

function createRuntimeClassPatch(): Patch {
  return new Patch({
    schema: 3,
    writer: 'alice',
    lamport: 2,
    context: { alice: 1 },
    ops: [
      new NodeAdd('user:alice', new Dot('alice', 1)),
      new EdgeAdd({
        from: 'user:alice',
        to: 'user:bob',
        label: 'knows',
        dot: new Dot('alice', 2),
      }),
      new PropSet('user:alice', 'name', 'Alice'),
    ],
    writes: ['user:alice'],
  });
}

function reducePatch(patch: Patch) {
  return reducePatches([{ patch, sha: 'a'.repeat(40) }]);
}

type MockBlobStorageOptions = {
  readonly storeResult?: string;
  readonly retrieveResult?: Uint8Array;
};

class MockPatchBlobStorage extends BlobStoragePort {
  private readonly _storeResult: string;
  private readonly _retrieveResult: Uint8Array;

  constructor(opts: MockBlobStorageOptions = {}) {
    super();
    this._storeResult = opts.storeResult ?? 'encrypted_oid';
    this._retrieveResult = opts.retrieveResult ?? new Uint8Array(0);
  }

  override store = vi.fn(async (
    _content: Uint8Array | string,
    _options?: BlobStorageOptions,
  ): Promise<string> => this._storeResult);

  override retrieve = vi.fn(async (_oid: string): Promise<Uint8Array> => this._retrieveResult);

  override async storeStream(
    _source: AsyncIterable<Uint8Array>,
    _options?: BlobStorageOptions,
  ): Promise<string> {
    return this._storeResult;
  }

  override async *retrieveStream(_oid: string): AsyncIterable<Uint8Array> {
    yield this._retrieveResult;
  }
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

    // @ts-expect-error Exercising the runtime guard for untyped JavaScript callers.
    expect(() => new CborPatchJournalAdapter({ blobPort })).toThrow('CborPatchJournalAdapter requires a codec');
    // @ts-expect-error Exercising the runtime guard for untyped JavaScript callers.
    expect(() => new CborPatchJournalAdapter({ codec })).toThrow('CborPatchJournalAdapter requires a blobPort');
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
      const storedBytes = storedBlobBytes(blobPort);
      const storedHex = Array.from(storedBytes).map(
        (/** @type {number} */ b) => b.toString(16).padStart(2, '0'),
      ).join('');

      expect(storedHex).toBe(GOLDEN_HEX);
    });

    it('round-trips the golden bytes back to the same domain object', async () => {
      const codec = new CborCodec();
      const goldenBytes = hexToBytes(GOLDEN_HEX);
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

    it('round-trips runtime op classes through CBOR and preserves reducer state', async () => {
      const codec = new CborCodec();
      const blobPort = createMemoryBlobPort();
      const adapter = new CborPatchJournalAdapter({ codec, blobPort });
      const originalPatch = createRuntimeClassPatch();

      const oid = await adapter.writePatch(originalPatch);
      const hydratedPatch = await adapter.readPatch(oid);
      const [nodeAdd, edgeAdd, propSet] = hydratedPatch.ops;

      expect(nodeAdd).toBeInstanceOf(NodeAdd);
      expect(edgeAdd).toBeInstanceOf(EdgeAdd);
      expect(propSet).toBeInstanceOf(PropSet);
      expect(reducePatch(hydratedPatch)).toEqual(reducePatch(originalPatch));
    });
  });

  describe('encrypted patch support', () => {
    function createMockBlobStorage(opts: MockBlobStorageOptions = {}): MockPatchBlobStorage {
      return new MockPatchBlobStorage(opts);
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
        ops: [new NodeAdd('n1', new Dot('alice', 1))],
      });
      const patch2 = createPatch({
        schema: 2,
        writer: 'alice',
        lamport: 2,
        context: { alice: 1 },
        ops: [new NodeAdd('n2', new Dot('alice', 2))],
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
