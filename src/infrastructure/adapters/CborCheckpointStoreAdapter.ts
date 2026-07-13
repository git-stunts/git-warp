import CheckpointStorePort, { type CheckpointRecord, type CheckpointWriteResult, type CheckpointData } from '../../ports/CheckpointStorePort.ts';
import type BlobPort from '../../ports/BlobPort.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import VersionVector from '../../domain/crdt/VersionVector.ts';
import type WarpState from '../../domain/services/state/WarpState.ts';
import { ProvenanceIndex } from '../../domain/services/provenance/ProvenanceIndex.ts';
import {
  deserializeCheckpointStateEnvelope,
  serializeCheckpointStateEnvelope,
  type CheckpointStateEnvelopeBuffers,
} from '../../domain/services/state/CheckpointSerializer.ts';

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
      ...(provenanceIndex !== null ? { provenanceIndex } : {}),
      indexShardOids,
    };
  }

  // ── Encode Helpers ──────────────────────────────────────────────────

  private _encodeStateEnvelope(state: WarpState): CheckpointStateEnvelopeBuffers {
    return serializeCheckpointStateEnvelope(state, { codec: this._codec });
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

  private _decodeStateEnvelope(envelope: CheckpointStateEnvelopeBuffers): WarpState {
    return deserializeCheckpointStateEnvelope(envelope, { codec: this._codec });
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
    const [
      nodeAliveBlobOid,
      edgeAliveBlobOid,
      propBlobOid,
      observedFrontierBlobOid,
      edgeBirthEventBlobOid,
      frontierBlobOid,
      appliedVVBlobOid,
      provenanceIndexBlobOid,
    ] = await Promise.all([
      writes.nodeAliveBlobOid,
      writes.edgeAliveBlobOid,
      writes.propBlobOid,
      writes.observedFrontierBlobOid,
      writes.edgeBirthEventBlobOid,
      writes.frontierBlobOid,
      writes.appliedVVBlobOid,
      writes.provenanceIndexBlobOid,
    ]);

    return {
      nodeAliveBlobOid,
      edgeAliveBlobOid,
      propBlobOid,
      observedFrontierBlobOid,
      edgeBirthEventBlobOid,
      frontierBlobOid,
      appliedVVBlobOid,
      provenanceIndexBlobOid,
    };
  }

  private async _resolveCheckpointReads(reads: CheckpointReadPromises): Promise<CheckpointReadBuffers> {
    const [
      nodeAlive,
      edgeAlive,
      prop,
      observedFrontier,
      edgeBirthEvent,
      frontier,
      appliedVV,
      provenanceIndex,
    ] = await Promise.all([
      reads.nodeAlive,
      reads.edgeAlive,
      reads.prop,
      reads.observedFrontier,
      reads.edgeBirthEvent,
      reads.frontier,
      reads.appliedVV,
      reads.provenanceIndex,
    ]);

    return {
      nodeAlive,
      edgeAlive,
      prop,
      observedFrontier,
      edgeBirthEvent,
      frontier,
      appliedVV,
      provenanceIndex,
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
