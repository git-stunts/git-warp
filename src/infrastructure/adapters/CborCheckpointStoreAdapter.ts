import CheckpointStorePort, { type CheckpointRecord, type CheckpointWriteResult, type CheckpointData } from '../../ports/CheckpointStorePort.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import ORSet from '../../domain/crdt/ORSet.ts';
import VersionVector from '../../domain/crdt/VersionVector.ts';
import WarpState from '../../domain/services/state/WarpState.ts';
import { ProvenanceIndex } from '../../domain/services/provenance/ProvenanceIndex.ts';
import type { LWWRegister } from '../../domain/crdt/LWW.ts';
import type { PropValue } from '../../domain/types/PropValue.ts';
import type { EventId } from '../../domain/utils/EventId.ts';
import type BlobStoragePort from '../../ports/BlobStoragePort.ts';
import { readPayloadBlob, writePayloadBlob } from './CasPayloadPointer.ts';

interface BlobPort {
  readBlob(oid: string): Promise<Uint8Array>;
  writeBlob(content: Uint8Array | string): Promise<string>;
}

interface CheckpointStateEnvelope {
  nodeAlive: Uint8Array;
  edgeAlive: Uint8Array;
  prop: Uint8Array;
  observedFrontier: Uint8Array;
  edgeBirthEvent: Uint8Array;
}

/**
 * CBOR-backed implementation of CheckpointStorePort.
 *
 * Owns the codec and raw blob persistence. Domain services call
 * writeCheckpoint(record) with domain objects; the adapter internally
 * encodes each artifact and writes blobs.
 */
export class CborCheckpointStoreAdapter extends CheckpointStorePort {
  private readonly _codec: CodecPort;
  private readonly _blobPort: BlobPort;
  private readonly _blobStorage: BlobStoragePort | null;

  constructor({ codec, blobPort, blobStorage }: {
    codec: CodecPort;
    blobPort: BlobPort;
    blobStorage?: BlobStoragePort | null;
  }) {
    super();
    if (codec === null || codec === undefined) {
      throw new WarpError('CborCheckpointStoreAdapter requires a codec', 'E_INVALID_DEPENDENCY');
    }
    if (blobPort === null || blobPort === undefined) {
      throw new WarpError('CborCheckpointStoreAdapter requires a blobPort', 'E_INVALID_DEPENDENCY');
    }
    this._codec = codec;
    this._blobPort = blobPort;
    this._blobStorage = blobStorage ?? null;
  }

  override async writeCheckpoint(record: CheckpointRecord): Promise<CheckpointWriteResult> {
    const stateEnvelope = this._encodeStateEnvelope(record.state);
    const frontierBytes = this._encodeFrontier(record.frontier);
    const appliedVVBytes = this._encodeAppliedVV(record.appliedVV);

    let provenanceBytes: Uint8Array | null = null;
    if (record.provenanceIndex !== null && record.provenanceIndex !== undefined) {
      provenanceBytes = record.provenanceIndex.serialize({ codec: this._codec });
    }

    const writes: Array<Promise<string>> = [
      this._writeCheckpointBlob(stateEnvelope.nodeAlive, 'checkpoint-node-alive'),
      this._writeCheckpointBlob(stateEnvelope.edgeAlive, 'checkpoint-edge-alive'),
      this._writeCheckpointBlob(stateEnvelope.prop, 'checkpoint-prop'),
      this._writeCheckpointBlob(stateEnvelope.observedFrontier, 'checkpoint-observed-frontier'),
      this._writeCheckpointBlob(stateEnvelope.edgeBirthEvent, 'checkpoint-edge-birth-event'),
      writePayloadBlob({
        blobPort: this._blobPort,
        blobStorage: this._blobStorage,
        bytes: frontierBytes,
        options: {
          slug: 'checkpoint-frontier',
          mime: 'application/cbor',
          size: frontierBytes.length,
        },
      }),
      writePayloadBlob({
        blobPort: this._blobPort,
        blobStorage: this._blobStorage,
        bytes: appliedVVBytes,
        options: {
          slug: 'checkpoint-applied-vv',
          mime: 'application/cbor',
          size: appliedVVBytes.length,
        },
      }),
    ];
    if (provenanceBytes !== null) {
      writes.push(writePayloadBlob({
        blobPort: this._blobPort,
        blobStorage: this._blobStorage,
        bytes: provenanceBytes,
        options: {
          slug: 'checkpoint-provenance-index',
          mime: 'application/cbor',
          size: provenanceBytes.length,
        },
      }));
    }

    const oids = await Promise.all(writes);
    return {
      nodeAliveBlobOid: oids[0] as string,
      edgeAliveBlobOid: oids[1] as string,
      propBlobOid: oids[2] as string,
      observedFrontierBlobOid: oids[3] as string,
      edgeBirthEventBlobOid: oids[4] as string,
      frontierBlobOid: oids[5] as string,
      appliedVVBlobOid: oids[6] as string,
      provenanceIndexBlobOid: oids.length > 7 ? (oids[7] as string) : null,
    };
  }

  override async readCheckpoint(treeOids: Record<string, string>): Promise<CheckpointData> {
    const frontierOid = treeOids['frontier.cbor'];
    const appliedVVOid = treeOids['appliedVV.cbor'];
    const provenanceOid = treeOids['provenanceIndex.cbor'];

    if (frontierOid === undefined) {
      throw new WarpError('Checkpoint missing frontier.cbor', 'E_MISSING_ARTIFACT');
    }

    const reads: Array<Promise<Uint8Array>> = [
      readPayloadBlob({
        blobPort: this._blobPort,
        blobStorage: this._blobStorage,
        oid: this._requireTreeOid(treeOids, 'state/nodeAlive'),
      }),
      readPayloadBlob({
        blobPort: this._blobPort,
        blobStorage: this._blobStorage,
        oid: this._requireTreeOid(treeOids, 'state/edgeAlive'),
      }),
      readPayloadBlob({
        blobPort: this._blobPort,
        blobStorage: this._blobStorage,
        oid: this._requireTreeOid(treeOids, 'state/prop.cbor'),
      }),
      readPayloadBlob({
        blobPort: this._blobPort,
        blobStorage: this._blobStorage,
        oid: this._requireTreeOid(treeOids, 'state/observedFrontier.cbor'),
      }),
      readPayloadBlob({
        blobPort: this._blobPort,
        blobStorage: this._blobStorage,
        oid: this._requireTreeOid(treeOids, 'state/edgeBirthEvent.cbor'),
      }),
      readPayloadBlob({ blobPort: this._blobPort, blobStorage: this._blobStorage, oid: frontierOid }),
    ];
    if (appliedVVOid !== undefined) {
      reads.push(readPayloadBlob({ blobPort: this._blobPort, blobStorage: this._blobStorage, oid: appliedVVOid }));
    }
    if (provenanceOid !== undefined) {
      reads.push(readPayloadBlob({ blobPort: this._blobPort, blobStorage: this._blobStorage, oid: provenanceOid }));
    }

    const buffers = await Promise.all(reads);
    let idx = 0;
    const state = this._decodeStateEnvelope({
      nodeAlive: buffers[idx++] as Uint8Array,
      edgeAlive: buffers[idx++] as Uint8Array,
      prop: buffers[idx++] as Uint8Array,
      observedFrontier: buffers[idx++] as Uint8Array,
      edgeBirthEvent: buffers[idx++] as Uint8Array,
    });
    const frontier = this._decodeFrontier(buffers[idx++] as Uint8Array);

    let appliedVV: VersionVector | null = null;
    if (appliedVVOid !== undefined) {
      appliedVV = this._decodeAppliedVV(buffers[idx++] as Uint8Array);
    }

    let provenanceIndex: ProvenanceIndex | null = null;
    if (provenanceOid !== undefined) {
      provenanceIndex = ProvenanceIndex.deserialize(buffers[idx++] as Uint8Array, { codec: this._codec });
    }

    let indexShardOids: Record<string, string> | null = null;
    const shardEntries = Object.entries(treeOids).filter(([p]) => p.startsWith('index/'));
    if (shardEntries.length > 0) {
      indexShardOids = Object.fromEntries(shardEntries.map(([p, o]) => [p.slice('index/'.length), o]));
    }

    return {
      state,
      frontier,
      appliedVV,
      stateHash: '',
      schema: 5,
      ...(provenanceIndex !== null ? { provenanceIndex } : {}),
      indexShardOids,
    };
  }

  // ── Encode Helpers ──────────────────────────────────────────────────

  private _encodeStateEnvelope(state: WarpState): CheckpointStateEnvelope {
    return {
      nodeAlive: this._codec.encode(state.nodeAlive.serialize()),
      edgeAlive: this._codec.encode(state.edgeAlive.serialize()),
      prop: this._codec.encode(_serializePropsArray(state.allPropEntries())),
      observedFrontier: this._codec.encode(VersionVector.serialize(state.observedFrontier)),
      edgeBirthEvent: this._codec.encode(_serializeEdgeBirthArray(state.edgeBirthEvent)),
    };
  }

  private _encodeFrontier(frontier: Map<string, string>): Uint8Array {
    const obj: Record<string, string | undefined> = {};
    for (const key of Array.from(frontier.keys()).sort()) {
      obj[key] = frontier.get(key);
    }
    return this._codec.encode(obj);
  }

  private _encodeAppliedVV(vv: VersionVector): Uint8Array {
    return this._codec.encode(VersionVector.serialize(vv));
  }

  // ── Decode Helpers ──────────────────────────────────────────────────

  private _decodeStateEnvelope(envelope: CheckpointStateEnvelope): WarpState {
    const edgeBirthEvent = this._codec.decode<Array<[string, EdgeBirthEventPayload]>>(
      envelope.edgeBirthEvent,
    );
    return new WarpState({
      nodeAlive: ORSet.deserialize(this._codec.decode<{ [x: string]: string[] }>(envelope.nodeAlive)),
      edgeAlive: ORSet.deserialize(this._codec.decode<{ [x: string]: string[] }>(envelope.edgeAlive)),
      prop: _deserializeProps(this._codec.decode<Array<[string, unknown]>>(envelope.prop)),
      observedFrontier: VersionVector.from(this._codec.decode<{ [x: string]: number }>(envelope.observedFrontier)),
      edgeBirthEvent: _deserializeEdgeBirthEvent({ edgeBirthEvent }),
    });
  }

  private _decodeFrontier(buffer: Uint8Array): Map<string, string> {
    const obj = this._codec.decode<Record<string, string>>(buffer);
    const frontier = new Map<string, string>();
    for (const [k, v] of Object.entries(obj)) {
      frontier.set(k, v);
    }
    return frontier;
  }

  private _decodeAppliedVV(buffer: Uint8Array): VersionVector {
    const obj = this._codec.decode<Record<string, number>>(buffer);
    return VersionVector.from(obj);
  }

  private _writeCheckpointBlob(bytes: Uint8Array, slug: string): Promise<string> {
    return writePayloadBlob({
      blobPort: this._blobPort,
      blobStorage: this._blobStorage,
      bytes,
      options: {
        slug,
        mime: 'application/cbor',
        size: bytes.length,
      },
    });
  }

  private _requireTreeOid(treeOids: Record<string, string>, path: string): string {
    const oid = treeOids[path];
    if (oid === undefined) {
      throw new WarpError(`Checkpoint missing ${path}`, 'E_MISSING_ARTIFACT');
    }
    return oid;
  }
}

// ── Private Helpers ───────────────────────────────────────────────────

function _serializePropsArray(propEntries: Iterable<readonly [string, LWWRegister<unknown>]>): Array<[string, unknown]> {
  const arr: Array<[string, unknown]> = [];
  for (const [key, register] of propEntries) {
    arr.push([key, _serializeLWWRegister(register)]);
  }
  arr.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return arr;
}

function _serializeEdgeBirthArray(edgeBirthEvent: Map<string, EventId> | undefined): Array<[string, { lamport: number; writerId: string; patchSha: string; opIndex: number }]> {
  const result: Array<[string, { lamport: number; writerId: string; patchSha: string; opIndex: number }]> = [];
  if (edgeBirthEvent !== undefined && edgeBirthEvent !== null) {
    for (const [key, eventId] of edgeBirthEvent) {
      result.push([key, {
        lamport: eventId.lamport, writerId: eventId.writerId,
        patchSha: eventId.patchSha, opIndex: eventId.opIndex,
      }]);
    }
    result.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }
  return result;
}

function _deserializeProps(propArray: Array<[string, unknown]>): Map<string, LWWRegister<PropValue>> {
  const prop = new Map<string, LWWRegister<PropValue>>();
  if (!Array.isArray(propArray)) { return prop; }
  for (const [key, registerObj] of propArray) {
    const register = _deserializeLWWRegister(
      registerObj as { eventId: { lamport: number; writerId: string; patchSha: string; opIndex: number }; value: unknown } | null,
    );
    if (register !== null) { prop.set(key, register); }
  }
  return prop;
}

interface EdgeBirthEventPayload {
  lamport?: number;
  writerId?: string;
  patchSha?: string;
  opIndex?: number;
}

function _deserializeEdgeBirthEvent(obj: { edgeBirthEvent?: Array<[string, EdgeBirthEventPayload]> }): Map<string, EventId> {
  const result = new Map<string, EventId>();
  const birthData = obj.edgeBirthEvent;
  if (!Array.isArray(birthData)) { return result; }
  for (const [key, val] of birthData) {
    result.set(key, {
      lamport: val.lamport ?? 0,
      writerId: val.writerId ?? '',
      patchSha: val.patchSha ?? '0000',
      opIndex: val.opIndex ?? 0,
    });
  }
  return result;
}

function _serializeLWWRegister(register: LWWRegister<unknown>): { eventId: { lamport: number; opIndex: number; patchSha: string; writerId: string }; value: unknown } | null {
  if (register === null || register === undefined) { return null; }
  return {
    eventId: {
      lamport: register.eventId.lamport, opIndex: register.eventId.opIndex,
      patchSha: register.eventId.patchSha, writerId: register.eventId.writerId,
    },
    value: register.value,
  };
}

function _deserializeLWWRegister(obj: { eventId: { lamport: number; writerId: string; patchSha: string; opIndex: number }; value: unknown } | null): LWWRegister<PropValue> | null {
  if (obj === null || obj === undefined) { return null; }
  return {
    eventId: {
      lamport: obj.eventId.lamport, writerId: obj.eventId.writerId,
      patchSha: obj.eventId.patchSha, opIndex: obj.eventId.opIndex,
    },
    value: obj.value as PropValue,
  };
}
