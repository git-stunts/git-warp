import CheckpointStorePort, { type CheckpointRecord, type CheckpointWriteResult, type CheckpointData } from '../../ports/CheckpointStorePort.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import VersionVector from '../../domain/crdt/VersionVector.ts';
import { ProvenanceIndex } from '../../domain/services/provenance/ProvenanceIndex.ts';
import type BlobStoragePort from '../../ports/BlobStoragePort.ts';
import { decodeWarpFullState, encodeWarpFullState } from '../codecs/WarpStateCborCodec.ts';
import { readPayloadBlob, writePayloadBlob } from './CasPayloadPointer.ts';

interface BlobPort {
  readBlob(oid: string): Promise<Uint8Array>;
  writeBlob(content: Uint8Array | string): Promise<string>;
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
    const stateBytes = encodeWarpFullState(record.state, this._codec);
    const frontierBytes = this._encodeFrontier(record.frontier);
    const appliedVVBytes = this._encodeAppliedVV(record.appliedVV);

    let provenanceBytes: Uint8Array | null = null;
    if (record.provenanceIndex !== null && record.provenanceIndex !== undefined) {
      provenanceBytes = record.provenanceIndex.serialize({ codec: this._codec });
    }

    const writes: Array<Promise<string>> = [
      writePayloadBlob({
        blobPort: this._blobPort,
        blobStorage: this._blobStorage,
        bytes: stateBytes,
        options: {
          slug: 'checkpoint-state',
          mime: 'application/cbor',
          size: stateBytes.length,
        },
      }),
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
      stateBlobOid: oids[0] as string,
      frontierBlobOid: oids[1] as string,
      appliedVVBlobOid: oids[2] as string,
      provenanceIndexBlobOid: oids.length > 3 ? (oids[3] as string) : null,
    };
  }

  override async readCheckpoint(treeOids: Record<string, string>): Promise<CheckpointData> {
    const stateOid = treeOids['state.cbor'];
    const frontierOid = treeOids['frontier.cbor'];
    const appliedVVOid = treeOids['appliedVV.cbor'];
    const provenanceOid = treeOids['provenanceIndex.cbor'];

    if (stateOid === undefined) {
      throw new WarpError('Checkpoint missing state.cbor', 'E_MISSING_ARTIFACT');
    }
    if (frontierOid === undefined) {
      throw new WarpError('Checkpoint missing frontier.cbor', 'E_MISSING_ARTIFACT');
    }

    const reads: Array<Promise<Uint8Array>> = [
      readPayloadBlob({ blobPort: this._blobPort, blobStorage: this._blobStorage, oid: stateOid }),
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
    const state = decodeWarpFullState(buffers[idx++] as Uint8Array, this._codec);
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
      schema: 2,
      ...(provenanceIndex !== null ? { provenanceIndex } : {}),
      indexShardOids,
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
}
