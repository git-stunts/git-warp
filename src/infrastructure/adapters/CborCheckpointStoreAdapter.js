import CheckpointStorePort from '../../ports/CheckpointStorePort.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import ORSet from '../../domain/crdt/ORSet.ts';
import VersionVector from '../../domain/crdt/VersionVector.ts';
import { createEmptyStateV5 } from '../../domain/services/JoinReducer.js';
import WarpStateV5 from '../../domain/services/state/WarpStateV5.js';
import { ProvenanceIndex } from '../../domain/services/provenance/ProvenanceIndex.js';

/**
 * CBOR-backed implementation of CheckpointStorePort.
 *
 * Owns the codec and raw blob persistence. Domain services call
 * writeCheckpoint(record) with domain objects; the adapter internally
 * encodes each artifact and writes blobs.
 *
 * @extends CheckpointStorePort
 */
export class CborCheckpointStoreAdapter extends CheckpointStorePort {
  /**
   * Creates a new CborCheckpointStoreAdapter.
   *
   * @param {{
   *   codec: { encode(value: unknown): Uint8Array, decode(bytes: Uint8Array): unknown },
   *   blobPort: { readBlob(oid: string): Promise<Uint8Array>, writeBlob(content: Uint8Array | string): Promise<string> },
   * }} options
   */
  constructor({ codec, blobPort }) {
    super();
    if (codec === null || codec === undefined) {
      throw new WarpError('CborCheckpointStoreAdapter requires a codec', 'E_INVALID_DEPENDENCY');
    }
    if (blobPort === null || blobPort === undefined) {
      throw new WarpError('CborCheckpointStoreAdapter requires a blobPort', 'E_INVALID_DEPENDENCY');
    }
    /** @type {{ encode(value: unknown): Uint8Array, decode(bytes: Uint8Array): unknown }} */
    this._codec = codec;
    /** @type {{ readBlob(oid: string): Promise<Uint8Array>, writeBlob(content: Uint8Array | string): Promise<string> }} */
    this._blobPort = blobPort;
  }

  /**
   * Persists a complete checkpoint: encodes and writes all artifacts
   * as blobs, returns the OIDs for tree assembly.
   *
   * @param {import('../../ports/CheckpointStorePort.ts').CheckpointRecord} record
   * @returns {Promise<import('../../ports/CheckpointStorePort.ts').CheckpointWriteResult>}
   */
  async writeCheckpoint(record) {
    // Encode all artifacts in parallel
    const stateBytes = this._encodeFullState(record.state);
    const frontierBytes = this._encodeFrontier(record.frontier);
    const appliedVVBytes = this._encodeAppliedVV(record.appliedVV);

    /** @type {Uint8Array | null} */
    let provenanceBytes = null;
    if (record.provenanceIndex !== null && record.provenanceIndex !== undefined) {
      provenanceBytes = record.provenanceIndex.serialize({ codec: this._codec });
    }

    // Write blobs in parallel
    const writes = [
      this._blobPort.writeBlob(stateBytes),
      this._blobPort.writeBlob(frontierBytes),
      this._blobPort.writeBlob(appliedVVBytes),
    ];
    if (provenanceBytes !== null) {
      writes.push(this._blobPort.writeBlob(provenanceBytes));
    }

    const oids = await Promise.all(writes);
    return {
      stateBlobOid: /** @type {string} */ (oids[0]),
      frontierBlobOid: /** @type {string} */ (oids[1]),
      appliedVVBlobOid: /** @type {string} */ (oids[2]),
      provenanceIndexBlobOid: oids.length > 3 ? /** @type {string} */ (oids[3]) : null,
    };
  }

  /**
   * Reads checkpoint artifacts from a tree of OIDs.
   *
   * @param {Record<string, string>} treeOids - Map of path → blob OID
   * @returns {Promise<import('../../ports/CheckpointStorePort.ts').CheckpointData>}
   */
  async readCheckpoint(treeOids) {
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

    // Read blobs in parallel
    /** @type {Array<Promise<Uint8Array>>} */
    const reads = [
      this._blobPort.readBlob(stateOid),
      this._blobPort.readBlob(frontierOid),
    ];
    if (appliedVVOid !== undefined) {
      reads.push(this._blobPort.readBlob(appliedVVOid));
    }
    if (provenanceOid !== undefined) {
      reads.push(this._blobPort.readBlob(provenanceOid));
    }

    const buffers = await Promise.all(reads);
    let idx = 0;
    const state = this._decodeFullState(/** @type {Uint8Array} */ (buffers[idx++]));
    const frontier = this._decodeFrontier(/** @type {Uint8Array} */ (buffers[idx++]));

    /** @type {VersionVector | null} */
    let appliedVV = null;
    if (appliedVVOid !== undefined) {
      appliedVV = this._decodeAppliedVV(/** @type {Uint8Array} */ (buffers[idx++]));
    }

    /** @type {ProvenanceIndex | null} */
    let provenanceIndex = null;
    if (provenanceOid !== undefined) {
      provenanceIndex = ProvenanceIndex.deserialize(/** @type {Uint8Array} */ (buffers[idx++]), { codec: this._codec });
    }

    // Partition index shard OIDs (entries with 'index/' prefix)
    /** @type {Record<string, string> | null} */
    let indexShardOids = null;
    const shardEntries = Object.entries(treeOids).filter(([p]) => p.startsWith('index/'));
    if (shardEntries.length > 0) {
      indexShardOids = Object.fromEntries(shardEntries.map(([p, o]) => [p.slice('index/'.length), o]));
    }

    return {
      state,
      frontier,
      appliedVV,
      stateHash: '', // Caller reads from commit message
      schema: 2,
      ...(provenanceIndex !== null ? { provenanceIndex } : {}),
      indexShardOids,
    };
  }

  // ── Encode Helpers ──────────────────────────────────────────────────

  /**
   * Encodes full V5 state to CBOR bytes.
   *
   * @param {import('../../domain/services/JoinReducer.js').WarpStateV5} state
   * @returns {Uint8Array}
   */
  _encodeFullState(state) {
    return this._codec.encode({
      version: 'full-v5',
      nodeAlive: state.nodeAlive.serialize(),
      edgeAlive: state.edgeAlive.serialize(),
      prop: _serializePropsArray(state.prop),
      observedFrontier: VersionVector.serialize(state.observedFrontier),
      edgeBirthEvent: _serializeEdgeBirthArray(state.edgeBirthEvent),
    });
  }

  /**
   * Encodes a frontier Map to CBOR bytes.
   *
   * @param {Map<string, string>} frontier
   * @returns {Uint8Array}
   */
  _encodeFrontier(frontier) {
    /** @type {Record<string, string | undefined>} */
    const obj = {};
    for (const key of Array.from(frontier.keys()).sort()) {
      obj[key] = frontier.get(key);
    }
    return this._codec.encode(obj);
  }

  /**
   * Encodes an applied VersionVector to CBOR bytes.
   *
   * @param {VersionVector} vv
   * @returns {Uint8Array}
   */
  _encodeAppliedVV(vv) {
    return this._codec.encode(VersionVector.serialize(vv));
  }

  // ── Decode Helpers ──────────────────────────────────────────────────

  /**
   * Decodes CBOR bytes to full V5 state.
   *
   * @param {Uint8Array} buffer
   * @returns {import('../../domain/services/JoinReducer.js').WarpStateV5}
   */
  _decodeFullState(buffer) {
    if (buffer === null || buffer === undefined) {
      return createEmptyStateV5();
    }
    const obj = /** @type {Record<string, unknown>} */ (this._codec.decode(buffer));
    if (obj === null || obj === undefined) {
      return createEmptyStateV5();
    }
    if (obj['version'] !== undefined && obj['version'] !== 'full-v5') {
      throw new WarpError(
        `Unsupported full state version: expected 'full-v5', got '${JSON.stringify(obj['version'])}'`,
        'E_UNSUPPORTED_VERSION',
      );
    }
    return new WarpStateV5({
      nodeAlive: ORSet.deserialize(obj['nodeAlive'] ?? {}),
      edgeAlive: ORSet.deserialize(obj['edgeAlive'] ?? {}),
      prop: _deserializeProps(/** @type {[string, unknown][]} */ (obj['prop'])),
      observedFrontier: VersionVector.from(
        /** @type {{ [x: string]: number }} */ (obj['observedFrontier'] ?? {}),
      ),
      edgeBirthEvent: _deserializeEdgeBirthEvent(obj),
    });
  }

  /**
   * Decodes CBOR bytes to a frontier Map.
   *
   * @param {Uint8Array} buffer
   * @returns {Map<string, string>}
   */
  _decodeFrontier(buffer) {
    const obj = /** @type {Record<string, string>} */ (this._codec.decode(buffer));
    /** @type {Map<string, string>} */
    const frontier = new Map();
    for (const [k, v] of Object.entries(obj)) {
      frontier.set(k, v);
    }
    return frontier;
  }

  /**
   * Decodes CBOR bytes to a VersionVector.
   *
   * @param {Uint8Array} buffer
   * @returns {VersionVector}
   */
  _decodeAppliedVV(buffer) {
    const obj = /** @type {{ [x: string]: number }} */ (this._codec.decode(buffer));
    return VersionVector.from(obj);
  }
}

// ── Private Helpers ───────────────────────────────────────────────────

/**
 * Serializes the props Map into a sorted array.
 *
 * @param {Map<string, import('../../domain/crdt/LWW.ts').LWWRegister<unknown>>} propMap
 * @returns {Array<[string, unknown]>}
 */
function _serializePropsArray(propMap) {
  /** @type {Array<[string, unknown]>} */
  const arr = [];
  for (const [key, register] of propMap) {
    arr.push([key, _serializeLWWRegister(register)]);
  }
  arr.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return arr;
}

/**
 * Serializes the edgeBirthEvent Map.
 *
 * @param {Map<string, import('../../domain/utils/EventId.ts').EventId> | undefined} edgeBirthEvent
 * @returns {Array<[string, {lamport: number, writerId: string, patchSha: string, opIndex: number}]>}
 */
function _serializeEdgeBirthArray(edgeBirthEvent) {
  /** @type {Array<[string, {lamport: number, writerId: string, patchSha: string, opIndex: number}]>} */
  const result = [];
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

/**
 * Deserializes props array.
 *
 * @param {Array<[string, unknown]>} propArray
 * @returns {Map<string, import('../../domain/crdt/LWW.ts').LWWRegister<unknown>>}
 */
function _deserializeProps(propArray) {
  /** @type {Map<string, import('../../domain/crdt/LWW.ts').LWWRegister<unknown>>} */
  const prop = new Map();
  if (!Array.isArray(propArray)) { return prop; }
  for (const [key, registerObj] of propArray) {
    const register = _deserializeLWWRegister(
      /** @type {{ eventId: { lamport: number, writerId: string, patchSha: string, opIndex: number }, value: unknown } | null} */ (registerObj),
    );
    if (register !== null) { prop.set(key, register); }
  }
  return prop;
}

/**
 * Deserializes edge birth events.
 *
 * @param {Record<string, unknown>} obj
 * @returns {Map<string, import('../../domain/utils/EventId.ts').EventId>}
 */
function _deserializeEdgeBirthEvent(obj) {
  /** @type {Map<string, import('../../domain/utils/EventId.ts').EventId>} */
  const result = new Map();
  const birthData = obj['edgeBirthEvent'] ?? obj['edgeBirthLamport'];
  if (!Array.isArray(birthData)) { return result; }
  const typedData = /** @type {Array<[string, unknown]>} */ (birthData);
  for (const [key, val] of typedData) {
    if (typeof val === 'number') {
      result.set(key, { lamport: val, writerId: '', patchSha: '0000', opIndex: 0 });
    } else {
      const ev = /** @type {{lamport: number, writerId: string, patchSha: string, opIndex: number}} */ (val);
      result.set(key, { lamport: ev.lamport, writerId: ev.writerId, patchSha: ev.patchSha, opIndex: ev.opIndex });
    }
  }
  return result;
}

/**
 * Serializes an LWW register.
 *
 * @param {import('../../domain/crdt/LWW.ts').LWWRegister<unknown>} register
 * @returns {{ eventId: { lamport: number, opIndex: number, patchSha: string, writerId: string }, value: unknown } | null}
 */
function _serializeLWWRegister(register) {
  if (register === null || register === undefined) { return null; }
  return {
    eventId: {
      lamport: register.eventId.lamport, opIndex: register.eventId.opIndex,
      patchSha: register.eventId.patchSha, writerId: register.eventId.writerId,
    },
    value: register.value,
  };
}

/**
 * Deserializes an LWW register.
 *
 * @param {{ eventId: { lamport: number, writerId: string, patchSha: string, opIndex: number }, value: unknown } | null} obj
 * @returns {import('../../domain/crdt/LWW.ts').LWWRegister<unknown> | null}
 */
function _deserializeLWWRegister(obj) {
  if (obj === null || obj === undefined) { return null; }
  return {
    eventId: {
      lamport: obj.eventId.lamport, writerId: obj.eventId.writerId,
      patchSha: obj.eventId.patchSha, opIndex: obj.eventId.opIndex,
    },
    value: obj.value,
  };
}
