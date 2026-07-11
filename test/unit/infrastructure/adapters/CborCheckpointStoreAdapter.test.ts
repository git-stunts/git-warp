import { describe, it, expect, vi } from 'vitest';
import { CborCheckpointStoreAdapter } from '../../../../src/infrastructure/adapters/CborCheckpointStoreAdapter.ts';
import { decodeCasPayloadPointer } from '../../../../src/infrastructure/adapters/CasPayloadPointer.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import CheckpointStorePort, { type CheckpointWriteResult } from '../../../../src/ports/CheckpointStorePort.ts';
import BlobStoragePort from '../../../../src/ports/BlobStoragePort.ts';
import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import MockBlobPort from '../../../helpers/MockBlobPort.ts';

/**
 * Builds a small but representative checkpoint state.
 * @returns {WarpState}
 */
function createGoldenState() {
  const nodeAlive = ORSet.empty();
  nodeAlive.add('user:alice', Dot.create('w1', 1));
  nodeAlive.add('user:bob', Dot.create('w1', 2));

  const edgeAlive = ORSet.empty();
  edgeAlive.add('user:alice\x00user:bob\x00knows', Dot.create('w1', 3));

    const prop = (new Map()) as any;
  prop.set('user:alice\x00name', {
    eventId: { lamport: 1, writerId: 'w1', patchSha: 'a'.repeat(40), opIndex: 0 },
    value: 'Alice',
  });

  const observedFrontier = VersionVector.empty();
  observedFrontier.set('w1', 3);

  return new WarpState({ nodeAlive, edgeAlive, prop, observedFrontier });
}

/**
 * Creates an in-memory BlobPort backed by MockBlobPort.
 * @returns {MockBlobPort}
 */
function createMemoryBlobPort() {
  return new MockBlobPort();
}

function checkpointTreeOids(result: CheckpointWriteResult): Record<string, string> {
  return {
    'state/nodeAlive': result.nodeAliveBlobOid,
    'state/edgeAlive': result.edgeAliveBlobOid,
    'state/prop.cbor': result.propBlobOid,
    'state/observedFrontier.cbor': result.observedFrontierBlobOid,
    'state/edgeBirthEvent.cbor': result.edgeBirthEventBlobOid,
    'frontier.cbor': result.frontierBlobOid,
    'appliedVV.cbor': result.appliedVVBlobOid,
  };
}

class MemoryBlobStorage extends BlobStoragePort {
  private readonly _store: Map<string, Uint8Array>;
  private _counter: number;

  constructor() {
    super();
    this._store = new Map();
    this._counter = 0;
  }

  override store = vi.fn(async (content: Uint8Array | string) => {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    const oid = `storage_${String(this._counter++).padStart(4, '0')}`;
    this._store.set(oid, bytes);
    return oid;
  });

  override retrieve = vi.fn(async (oid: string) => {
    const bytes = this._store.get(oid);
    if (bytes === undefined) {
      throw new Error(`Storage OID not found: ${oid}`);
    }
    return bytes;
  });

  override async storeStream(source: AsyncIterable<Uint8Array>): Promise<string> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of source) {
      chunks.push(chunk);
    }
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return await this.store(merged);
  }

  override retrieveStream(oid: string): AsyncIterable<Uint8Array> {
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        yield await self.retrieve(oid);
      },
    };
  }
}

describe('CborCheckpointStoreAdapter (collapsed)', () => {
  it('extends CheckpointStorePort', () => {
    const adapter = new CborCheckpointStoreAdapter({
      codec: new CborCodec(), blobPort: createMemoryBlobPort(),
    });
    expect(adapter).toBeInstanceOf(CheckpointStorePort);
  });

  it('requires codec and blobPort dependencies', () => {
    expect(() =>
      new CborCheckpointStoreAdapter({
        codec: (null as any),
        blobPort: createMemoryBlobPort(),
      })
    ).toThrow('requires a codec');

    expect(() =>
      new CborCheckpointStoreAdapter({
        codec: new CborCodec(),
        blobPort: (null as any),
      })
    ).toThrow('requires a blobPort');
  });

  describe('writeCheckpoint', () => {
    it('returns OIDs for state envelope, frontier, appliedVV', async () => {
      const blobPort = createMemoryBlobPort();
      const adapter = new CborCheckpointStoreAdapter({
        codec: new CborCodec(), blobPort,
      });

      const vv = VersionVector.empty();
      vv.set('w1', 3);

      const result = await adapter.writeCheckpoint({
        state: createGoldenState(),
        frontier: new Map([['w1', 'abc123']]),
        appliedVV: vv,
        stateHash: 'deadbeef',
      });

      expect(typeof result.nodeAliveBlobOid).toBe('string');
      expect(typeof result.edgeAliveBlobOid).toBe('string');
      expect(typeof result.propBlobOid).toBe('string');
      expect(typeof result.observedFrontierBlobOid).toBe('string');
      expect(typeof result.edgeBirthEventBlobOid).toBe('string');
      expect(typeof result.frontierBlobOid).toBe('string');
      expect(typeof result.appliedVVBlobOid).toBe('string');
      expect(result.provenanceIndexBlobOid).toBeNull();
      expect(blobPort.writeBlob).toHaveBeenCalledTimes(7);
    });

    it('writes 8 blobs when provenanceIndex is provided', async () => {
      const blobPort = createMemoryBlobPort();
      const adapter = new CborCheckpointStoreAdapter({
        codec: new CborCodec(), blobPort,
      });

      const { ProvenanceIndex } = await import('../../../../src/domain/services/provenance/ProvenanceIndex.ts');
      const provIndex = new ProvenanceIndex();

      const vv = VersionVector.empty();

      const result = await adapter.writeCheckpoint({
        state: createGoldenState(),
        frontier: new Map(),
        appliedVV: vv,
        stateHash: 'deadbeef',
        provenanceIndex: provIndex,
      });

      expect(result.provenanceIndexBlobOid).not.toBeNull();
      expect(blobPort.writeBlob).toHaveBeenCalledTimes(8);
    });

    it('stores checkpoint payloads behind CAS pointer blobs when blobStorage is configured', async () => {
      const blobPort = createMemoryBlobPort();
      const blobStorage = new MemoryBlobStorage();
      const adapter = new CborCheckpointStoreAdapter({
        codec: new CborCodec(),
        blobPort,
        blobStorage,
      });

      const vv = VersionVector.empty();
      vv.set('w1', 3);

      const result = await adapter.writeCheckpoint({
        state: createGoldenState(),
        frontier: new Map([['w1', 'abc123']]),
        appliedVV: vv,
        stateHash: 'deadbeef',
      });

      expect(blobStorage.store).toHaveBeenCalledTimes(7);

      const nodeAlivePointer = await blobPort.readBlob(result.nodeAliveBlobOid);
      const frontierPointer = await blobPort.readBlob(result.frontierBlobOid);
      const appliedVVPointer = await blobPort.readBlob(result.appliedVVBlobOid);

      expect(decodeCasPayloadPointer(nodeAlivePointer)).toBe('storage_0000');
      expect(decodeCasPayloadPointer(frontierPointer)).toBe('storage_0005');
      expect(decodeCasPayloadPointer(appliedVVPointer)).toBe('storage_0006');
    });
  });

  describe('readCheckpoint', () => {
    it('round-trips state, frontier, appliedVV', async () => {
      const blobPort = createMemoryBlobPort();
      const codec = new CborCodec();
      const adapter = new CborCheckpointStoreAdapter({ codec, blobPort });

      const vv = VersionVector.empty();
      vv.set('w1', 3);

      const writeResult = await adapter.writeCheckpoint({
        state: createGoldenState(),
        frontier: new Map([['w1', 'abc123']]),
        appliedVV: vv,
        stateHash: 'deadbeef',
      });

      const data = await adapter.readCheckpoint(checkpointTreeOids(writeResult));

      expect(data.state).toBeDefined();
      expect(data.state.nodeAlive).toBeDefined();
      expect(data.frontier.get('w1')).toBe('abc123');
      expect(data.appliedVV).not.toBeNull();
      expect((data.appliedVV as NonNullable<typeof data.appliedVV>).get('w1')).toBe(3);
    });

    it('throws on missing schema:5 state envelope artifacts', async () => {
      const adapter = new CborCheckpointStoreAdapter({
        codec: new CborCodec(), blobPort: createMemoryBlobPort(),
      });
      await expect(adapter.readCheckpoint({ 'frontier.cbor': 'frontier' }))
        .rejects.toThrow('missing state/nodeAlive');
    });

    it('throws on missing frontier.cbor', async () => {
      const blobPort = createMemoryBlobPort();
      const adapter = new CborCheckpointStoreAdapter({
        codec: new CborCodec(), blobPort,
      });

      const nodeAliveOid = await blobPort.writeBlob(new Uint8Array([1, 2, 3]));

      await expect(adapter.readCheckpoint({ 'state/nodeAlive': nodeAliveOid }))
        .rejects.toThrow('missing frontier.cbor');
    });

    it('returns stripped index shard oids when index artifacts are present', async () => {
      const blobPort = createMemoryBlobPort();
      const codec = new CborCodec();
      const adapter = new CborCheckpointStoreAdapter({ codec, blobPort });

      const vv = VersionVector.empty();
      const writeResult = await adapter.writeCheckpoint({
        state: createGoldenState(),
        frontier: new Map(),
        appliedVV: vv,
        stateHash: 'deadbeef',
      });

      const data = await adapter.readCheckpoint({
        ...checkpointTreeOids(writeResult),
        'index/meta_aa.cbor': 'oid-meta',
        'index/props_aa.cbor': 'oid-props',
      });

      expect(data.indexShardOids).toEqual({
        'meta_aa.cbor': 'oid-meta',
        'props_aa.cbor': 'oid-props',
      });
    });

    it('round-trips CAS-backed pointer blobs via blobStorage', async () => {
      const blobPort = createMemoryBlobPort();
      const blobStorage = new MemoryBlobStorage();
      const codec = new CborCodec();
      const adapter = new CborCheckpointStoreAdapter({ codec, blobPort, blobStorage });

      const vv = VersionVector.empty();
      vv.set('w1', 3);

      const writeResult = await adapter.writeCheckpoint({
        state: createGoldenState(),
        frontier: new Map([['w1', 'abc123']]),
        appliedVV: vv,
        stateHash: 'deadbeef',
      });

      const data = await adapter.readCheckpoint(checkpointTreeOids(writeResult));

      expect(data.frontier.get('w1')).toBe('abc123');
      expect(data.appliedVV?.get('w1')).toBe(3);
      expect(blobStorage.retrieve).toHaveBeenCalledTimes(7);
    });
  });

  describe('state envelope helpers', () => {
    it('sorts props and edge birth events, skips null registers, and round-trips birth metadata', () => {
      const codec = new CborCodec();
      const adapter = ((new CborCheckpointStoreAdapter({
        codec,
        blobPort: createMemoryBlobPort(),
      })) as any);

      const prop = new Map([
        ['user:z\x00name', {
          eventId: new EventId(3, 'w3', 'c'.repeat(40), 2),
          value: 'Zed',
        }],
        ['user:a\x00name', {
          eventId: new EventId(1, 'w1', 'a'.repeat(40), 0),
          value: 'Ada',
        }],
        ['user:skip\x00name', (null)],
      ] as any);

      const edgeBirthEvent = new Map([
        ['user:z\x00user:y\x00likes', new EventId(9, 'w9', 'f'.repeat(40), 2)],
        ['user:a\x00user:b\x00knows', new EventId(1, 'w1', 'e'.repeat(40), 0)],
      ]);

      const state = new WarpState({
        nodeAlive: ORSet.empty(),
        edgeAlive: ORSet.empty(),
        prop: (prop as any),
        observedFrontier: VersionVector.empty(),
        edgeBirthEvent,
      });

      const envelope = adapter._encodeStateEnvelope(state);
      const rawProp = /** @type {Array<[string, unknown]>} */ (codec.decode(envelope.prop));
      const rawEdgeBirthEvent =
        /** @type {Array<[string, unknown]>} */ (codec.decode(envelope.edgeBirthEvent));

      expect((rawProp as any).map(([key]) => key)).toEqual([
        'user:a\x00name',
        'user:skip\x00name',
        'user:z\x00name',
      ]);
      expect((rawEdgeBirthEvent as any).map(([key]) => key)).toEqual([
        'user:a\x00user:b\x00knows',
        'user:z\x00user:y\x00likes',
      ]);

      const decoded = adapter._decodeStateEnvelope(envelope);
      expect(decoded.prop.has('user:skip\x00name')).toBe(false);
      expect(decoded.prop.get('user:a\x00name')?.value).toBe('Ada');
      expect(decoded.edgeBirthEvent.get('user:a\x00user:b\x00knows')).toEqual({
        lamport: 1,
        writerId: 'w1',
        patchSha: 'e'.repeat(40),
        opIndex: 0,
      });
    });
  });
});
