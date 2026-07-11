import { describe, it, expect } from 'vitest';
import { CborCheckpointStoreAdapter } from '../../../../src/infrastructure/adapters/CborCheckpointStoreAdapter.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import CheckpointStorePort, { type CheckpointWriteResult } from '../../../../src/ports/CheckpointStorePort.ts';
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

    it('writes checkpoint tree blobs directly', async () => {
      const blobPort = createMemoryBlobPort();
      const codec = new CborCodec();
      const adapter = new CborCheckpointStoreAdapter({
        codec,
        blobPort,
      });

      const vv = VersionVector.empty();
      vv.set('w1', 3);

      const result = await adapter.writeCheckpoint({
        state: createGoldenState(),
        frontier: new Map([['w1', 'abc123']]),
        appliedVV: vv,
        stateHash: 'deadbeef',
      });

      const nodeAliveBytes = await blobPort.readBlob(result.nodeAliveBlobOid);
      const frontierBytes = await blobPort.readBlob(result.frontierBlobOid);
      const appliedVVBytes = await blobPort.readBlob(result.appliedVVBlobOid);

      expect(nodeAliveBytes.byteLength).toBeGreaterThan(0);
      expect(codec.decode(frontierBytes)).toEqual({ w1: 'abc123' });
      expect(codec.decode(appliedVVBytes)).toEqual({ w1: 3 });
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

    it('round-trips direct checkpoint blobs', async () => {
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

      expect(data.frontier.get('w1')).toBe('abc123');
      expect(data.appliedVV?.get('w1')).toBe(3);
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
      const decodedBirthEvent = decoded.edgeBirthEvent.get('user:a\x00user:b\x00knows');
      expect(decodedBirthEvent).toBeInstanceOf(EventId);
      expect(decodedBirthEvent).toEqual(new EventId(1, 'w1', 'e'.repeat(40), 0));
    });

    it('rejects malformed edge birth payloads', async () => {
      const blobPort = createMemoryBlobPort();
      const codec = new CborCodec();
      const adapter = new CborCheckpointStoreAdapter({ codec, blobPort });
      const treeOids = {
        'state/nodeAlive': await blobPort.writeBlob(codec.encode({})),
        'state/edgeAlive': await blobPort.writeBlob(codec.encode({})),
        'state/prop.cbor': await blobPort.writeBlob(codec.encode([])),
        'state/observedFrontier.cbor': await blobPort.writeBlob(codec.encode({})),
        'state/edgeBirthEvent.cbor': await blobPort.writeBlob(codec.encode([
          ['user:a\x00user:b\x00knows', {
            lamport: 0,
            writerId: '',
            patchSha: '0000',
            opIndex: 0,
          }],
        ])),
        'frontier.cbor': await blobPort.writeBlob(codec.encode({})),
      };

      await expect(adapter.readCheckpoint(treeOids))
        .rejects.toThrow('Checkpoint edgeBirthEvent payload is invalid');
    });

    it('rejects non-array edge birth payloads', async () => {
      const blobPort = createMemoryBlobPort();
      const codec = new CborCodec();
      const adapter = new CborCheckpointStoreAdapter({ codec, blobPort });
      const treeOids = {
        'state/nodeAlive': await blobPort.writeBlob(codec.encode({})),
        'state/edgeAlive': await blobPort.writeBlob(codec.encode({})),
        'state/prop.cbor': await blobPort.writeBlob(codec.encode([])),
        'state/observedFrontier.cbor': await blobPort.writeBlob(codec.encode({})),
        'state/edgeBirthEvent.cbor': await blobPort.writeBlob(codec.encode({ not: 'an-array' })),
        'frontier.cbor': await blobPort.writeBlob(codec.encode({})),
      };

      await expect(adapter.readCheckpoint(treeOids))
        .rejects.toThrow('Checkpoint edgeBirthEvent payload is invalid');
    });
  });
});
