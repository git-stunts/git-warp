import CheckpointStorePort, { type CheckpointRecord, type CheckpointWriteResult, type CheckpointData } from '../../ports/CheckpointStorePort.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import ORSet from '../../domain/crdt/ORSet.ts';
import VersionVector from '../../domain/crdt/VersionVector.ts';
import WarpState from '../../domain/services/state/WarpState.ts';
import { ProvenanceIndex } from '../../domain/services/provenance/ProvenanceIndex.ts';
import type { LWWRegister } from '../../domain/crdt/LWW.ts';
import type { PropValue } from '../../domain/types/PropValue.ts';
import { EventId } from '../../domain/utils/EventId.ts';
import type BlobStoragePort from '../../ports/BlobStoragePort.ts';

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

interface CheckpointWritePromises {
  nodeAliveBlobOid: Promise<string>;
  edgeAliveBlobOid: Promise<string>;
  propBlobOid: Promise<string>;
  observedFrontierBlobOid: Promise<string>;
  edgeBirthEventBlobOid: Promise<string>;
  frontierBlobOid: Promise<string>;
  appliedVVBlobOid: Promise<string>;
  provenanceIndexBlobOid: Promise<string | null>;
}

interface CheckpointReadPromises {
  nodeAlive: Promise<Uint8Array>;
  edgeAlive: Promise<Uint8Array>;
  prop: Promise<Uint8Array>;
  observedFrontier: Promise<Uint8Array>;
  edgeBirthEvent: Promise<Uint8Array>;
  frontier: Promise<Uint8Array>;
  appliedVV: Promise<Uint8Array | null>;
  provenanceIndex: Promise<Uint8Array | null>;
}

interface CheckpointReadBuffers {
  nodeAlive: Uint8Array;
  edgeAlive: Uint8Array;
  prop: Uint8Array;
  observedFrontier: Uint8Array;
  edgeBirthEvent: Uint8Array;
  frontier: Uint8Array;
  appliedVV: Uint8Array | null;
  provenanceIndex: Uint8Array | null;
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

  constructor({ codec, blobPort }: {
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
  }

  override async writeCheckpoint(record: CheckpointRecord): Promise<CheckpointWriteResult> {
    const stateEnvelope = this._encodeStateEnvelope(record.state);
    const frontierBytes = this._encodeFrontier(record.frontier);
    const appliedVVBytes = this._encodeAppliedVV(record.appliedVV);

    let provenanceBytes: Uint8Array | null = null;
    if (record.provenanceIndex !== null && record.provenanceIndex !== undefined) {
      provenanceBytes = record.provenanceIndex.serialize({ codec: this._codec });
    }

    const writes: CheckpointWritePromises = {
      nodeAliveBlobOid: this._writeCheckpointBlob(stateEnvelope.nodeAlive),
      edgeAliveBlobOid: this._writeCheckpointBlob(stateEnvelope.edgeAlive),
      propBlobOid: this._writeCheckpointBlob(stateEnvelope.prop),
      observedFrontierBlobOid: this._writeCheckpointBlob(stateEnvelope.observedFrontier),
      edgeBirthEventBlobOid: this._writeCheckpointBlob(stateEnvelope.edgeBirthEvent),
      frontierBlobOid: this._writeCheckpointBlob(frontierBytes),
      appliedVVBlobOid: this._writeCheckpointBlob(appliedVVBytes),
      provenanceIndexBlobOid: provenanceBytes !== null
        ? this._writeCheckpointBlob(provenanceBytes)
        : Promise.resolve(null),
    };

    return await this._resolveCheckpointWrites(writes);
  }

  override async readCheckpoint(treeOids: Record<string, string>): Promise<CheckpointData> {
    const frontierOid = treeOids['frontier.cbor'];
    const appliedVVOid = treeOids['appliedVV.cbor'];
    const provenanceOid = treeOids['provenanceIndex.cbor'];

    if (frontierOid === undefined) {
      throw new WarpError('Checkpoint missing frontier.cbor', 'E_MISSING_ARTIFACT');
    }

    const reads: CheckpointReadPromises = {
      nodeAlive: this._readCheckpointBlob(this._requireTreeOid(treeOids, 'state/nodeAlive')),
      edgeAlive: this._readCheckpointBlob(this._requireTreeOid(treeOids, 'state/edgeAlive')),
      prop: this._readCheckpointBlob(this._requireTreeOid(treeOids, 'state/prop.cbor')),
      observedFrontier: this._readCheckpointBlob(this._requireTreeOid(treeOids, 'state/observedFrontier.cbor')),
      edgeBirthEvent: this._readCheckpointBlob(this._requireTreeOid(treeOids, 'state/edgeBirthEvent.cbor')),
      frontier: this._readCheckpointBlob(frontierOid),
      appliedVV: appliedVVOid !== undefined
        ? this._readCheckpointBlob(appliedVVOid)
        : Promise.resolve(null),
      provenanceIndex: provenanceOid !== undefined
        ? this._readCheckpointBlob(provenanceOid)
        : Promise.resolve(null),
    };

    const buffers = await this._resolveCheckpointReads(reads);
    const state = this._decodeStateEnvelope({
      nodeAlive: buffers.nodeAlive,
      edgeAlive: buffers.edgeAlive,
      prop: buffers.prop,
      observedFrontier: buffers.observedFrontier,
      edgeBirthEvent: buffers.edgeBirthEvent,
    });
    const frontier = this._decodeFrontier(buffers.frontier);

    let appliedVV: VersionVector | null = null;
    if (buffers.appliedVV !== null) {
      appliedVV = this._decodeAppliedVV(buffers.appliedVV);
    }

    let provenanceIndex: ProvenanceIndex | null = null;
    if (buffers.provenanceIndex !== null) {
      provenanceIndex = ProvenanceIndex.deserialize(buffers.provenanceIndex, { codec: this._codec });
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

  private async _resolveCheckpointWrites(writes: CheckpointWritePromises): Promise<CheckpointWriteResult> {
    return {
      nodeAliveBlobOid: await writes.nodeAliveBlobOid,
      edgeAliveBlobOid: await writes.edgeAliveBlobOid,
      propBlobOid: await writes.propBlobOid,
      observedFrontierBlobOid: await writes.observedFrontierBlobOid,
      edgeBirthEventBlobOid: await writes.edgeBirthEventBlobOid,
      frontierBlobOid: await writes.frontierBlobOid,
      appliedVVBlobOid: await writes.appliedVVBlobOid,
      provenanceIndexBlobOid: await writes.provenanceIndexBlobOid,
    };
  }

  private async _resolveCheckpointReads(reads: CheckpointReadPromises): Promise<CheckpointReadBuffers> {
    return {
      nodeAlive: await reads.nodeAlive,
      edgeAlive: await reads.edgeAlive,
      prop: await reads.prop,
      observedFrontier: await reads.observedFrontier,
      edgeBirthEvent: await reads.edgeBirthEvent,
      frontier: await reads.frontier,
      appliedVV: await reads.appliedVV,
      provenanceIndex: await reads.provenanceIndex,
    };
  }

  private _writeCheckpointBlob(bytes: Uint8Array): Promise<string> {
    return this._blobPort.writeBlob(bytes);
  }

  private _readCheckpointBlob(oid: string): Promise<Uint8Array> {
    return this._blobPort.readBlob(oid);
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
  lamport: number;
  writerId: string;
  patchSha: string;
  opIndex: number;
}

function _deserializeEdgeBirthEvent(obj: { edgeBirthEvent?: Array<[string, EdgeBirthEventPayload]> }): Map<string, EventId> {
  const result = new Map<string, EventId>();
  const birthData = obj.edgeBirthEvent;
  if (!Array.isArray(birthData)) { return result; }
  for (const entry of birthData) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw invalidEdgeBirthEventPayload('unknown');
    }
    const [key, value] = entry;
    if (typeof key !== 'string' || !isEdgeBirthEventPayload(value)) {
      throw invalidEdgeBirthEventPayload(typeof key === 'string' ? key : 'unknown');
    }
    try {
      result.set(key, new EventId(value.lamport, value.writerId, value.patchSha, value.opIndex));
    } catch {
      throw invalidEdgeBirthEventPayload(key);
    }
  }
  return result;
}

function isEdgeBirthEventPayload(value: EdgeBirthEventPayload | null | undefined): value is EdgeBirthEventPayload {
  return value !== null
    && value !== undefined
    && typeof value.lamport === 'number'
    && typeof value.writerId === 'string'
    && typeof value.patchSha === 'string'
    && typeof value.opIndex === 'number';
}

function invalidEdgeBirthEventPayload(key: string): WarpError {
  return new WarpError(
    `Checkpoint edgeBirthEvent payload is invalid for ${key}`,
    'E_INVALID_CHECKPOINT_EDGE_BIRTH_EVENT',
  );
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
