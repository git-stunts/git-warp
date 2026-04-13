import { describe, it, expect } from 'vitest';
import { CborCheckpointStoreAdapter } from '../../../../src/infrastructure/adapters/CborCheckpointStoreAdapter.js';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.js';
import CheckpointStorePort from '../../../../src/ports/CheckpointStorePort.ts';
import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import MockBlobPort from '../../../helpers/MockBlobPort.js';

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

  /** @type {Map<string, import('../../../../src/domain/crdt/LWW.js').LWWRegister<import('../../../../src/domain/types/PropValue.ts').PropValue>>} */
  const prop = new Map();
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
        codec: /** @type {any} */ (null),
        blobPort: createMemoryBlobPort(),
      })
    ).toThrow('requires a codec');

    expect(() =>
      new CborCheckpointStoreAdapter({
        codec: new CborCodec(),
        blobPort: /** @type {any} */ (null),
      })
    ).toThrow('requires a blobPort');
  });

  describe('writeCheckpoint', () => {
    it('returns OIDs for state, frontier, appliedVV', async () => {
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

      const vv = VersionVector.empty();

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

      const vv = VersionVector.empty();
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
      expect(/** @type {NonNullable<typeof data.appliedVV>} */ (data.appliedVV).get('w1')).toBe(3);
    });

    it('throws on missing state.cbor', async () => {
      const adapter = new CborCheckpointStoreAdapter({
        codec: new CborCodec(), blobPort: createMemoryBlobPort(),
      });
      await expect(adapter.readCheckpoint({})).rejects.toThrow('missing state.cbor');
    });

    it('throws on missing frontier.cbor', async () => {
      const blobPort = createMemoryBlobPort();
      const adapter = new CborCheckpointStoreAdapter({
        codec: new CborCodec(), blobPort,
      });

      const stateOid = await blobPort.writeBlob(new Uint8Array([1, 2, 3]));

      await expect(adapter.readCheckpoint({ 'state.cbor': stateOid })).rejects.toThrow('missing frontier.cbor');
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
        'state.cbor': writeResult.stateBlobOid,
        'frontier.cbor': writeResult.frontierBlobOid,
        'appliedVV.cbor': writeResult.appliedVVBlobOid,
        'index/meta_aa.cbor': 'oid-meta',
        'index/props_aa.cbor': 'oid-props',
      });

      expect(data.indexShardOids).toEqual({
        'meta_aa.cbor': 'oid-meta',
        'props_aa.cbor': 'oid-props',
      });
    });
  });

  describe('state encoding helpers', () => {
    it('returns empty state when the full-state buffer or payload is absent', () => {
      const adapter = /** @type {any} */ (new CborCheckpointStoreAdapter({
        codec: new CborCodec(),
        blobPort: createMemoryBlobPort(),
      }));

      const emptyFromNullBuffer = adapter._decodeFullState(null);
      expect(emptyFromNullBuffer).toBeInstanceOf(WarpState);
      expect(emptyFromNullBuffer.nodeAlive.entries.size).toBe(0);

      const nullDecodingAdapter = /** @type {any} */ (new CborCheckpointStoreAdapter({
        codec: {
          encode(value) {
            return /** @type {Uint8Array} */ (value);
          },
          decode() {
            return null;
          },
        },
        blobPort: createMemoryBlobPort(),
      }));

      const emptyFromNullPayload = nullDecodingAdapter._decodeFullState(new Uint8Array([1]));
      expect(emptyFromNullPayload).toBeInstanceOf(WarpState);
      expect(emptyFromNullPayload.edgeAlive.entries.size).toBe(0);
    });

    it('rejects unsupported full-state versions', () => {
      const adapter = /** @type {any} */ (new CborCheckpointStoreAdapter({
        codec: {
          encode(value) {
            return /** @type {Uint8Array} */ (value);
          },
          decode() {
            return { version: 'full-v4' };
          },
        },
        blobPort: createMemoryBlobPort(),
      }));

      expect(() => adapter._decodeFullState(new Uint8Array([1]))).toThrow('Unsupported full state version');
    });

    it('sorts props and edge birth events, skips null registers, and round-trips birth metadata', () => {
      const codec = new CborCodec();
      const adapter = /** @type {any} */ (new CborCheckpointStoreAdapter({
        codec,
        blobPort: createMemoryBlobPort(),
      }));

      /** @type {Map<string, import('../../../../src/domain/crdt/LWW.js').LWWRegister<import('../../../../src/domain/types/PropValue.ts').PropValue>>} */
      const prop = new Map([
        ['user:z\x00name', {
          eventId: new EventId(3, 'w3', 'c'.repeat(40), 2),
          value: 'Zed',
        }],
        ['user:a\x00name', {
          eventId: new EventId(1, 'w1', 'a'.repeat(40), 0),
          value: 'Ada',
        }],
        ['user:skip\x00name', /** @type {any} */ (null)],
      ]);

      const edgeBirthEvent = new Map([
        ['user:z\x00user:y\x00likes', new EventId(9, 'w9', 'f'.repeat(40), 2)],
        ['user:a\x00user:b\x00knows', new EventId(1, 'w1', 'e'.repeat(40), 0)],
      ]);

      const state = new WarpState({
        nodeAlive: ORSet.empty(),
        edgeAlive: ORSet.empty(),
        prop,
        observedFrontier: VersionVector.empty(),
        edgeBirthEvent,
      });

      const bytes = adapter._encodeFullState(state);
      const raw = /** @type {{
        prop: Array<[string, unknown]>,
        edgeBirthEvent: Array<[string, unknown]>,
      }} */ (codec.decode(bytes));

      expect(raw.prop.map(([key]) => key)).toEqual([
        'user:a\x00name',
        'user:skip\x00name',
        'user:z\x00name',
      ]);
      expect(raw.edgeBirthEvent.map(([key]) => key)).toEqual([
        'user:a\x00user:b\x00knows',
        'user:z\x00user:y\x00likes',
      ]);

      const decoded = adapter._decodeFullState(bytes);
      expect(decoded.prop.has('user:skip\x00name')).toBe(false);
      expect(decoded.prop.get('user:a\x00name')?.value).toBe('Ada');
      expect(decoded.edgeBirthEvent.get('user:a\x00user:b\x00knows')).toEqual({
        lamport: 1,
        writerId: 'w1',
        patchSha: 'e'.repeat(40),
        opIndex: 0,
      });
    });

    it('accepts legacy numeric edge birth data when decoding full state', () => {
      const adapter = /** @type {any} */ (new CborCheckpointStoreAdapter({
        codec: {
          encode(value) {
            return /** @type {Uint8Array} */ (value);
          },
          decode() {
            return {
              nodeAlive: {},
              edgeAlive: {},
              prop: [],
              observedFrontier: {},
              edgeBirthLamport: [['user:a\x00user:b\x00knows', 7]],
            };
          },
        },
        blobPort: createMemoryBlobPort(),
      }));

      const decoded = adapter._decodeFullState(new Uint8Array([1]));
      expect(decoded.edgeBirthEvent.get('user:a\x00user:b\x00knows')).toEqual({
        lamport: 7,
        writerId: '',
        patchSha: '0000',
        opIndex: 0,
      });
    });
  });
});
