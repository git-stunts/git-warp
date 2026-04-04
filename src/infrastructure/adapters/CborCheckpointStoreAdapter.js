import CheckpointStorePort from '../../ports/CheckpointStorePort.js';
import WarpError from '../../domain/errors/WarpError.js';
import { orsetSerialize, orsetDeserialize } from '../../domain/crdt/ORSet.js';
import VersionVector, { vvSerialize } from '../../domain/crdt/VersionVector.js';
import { createEmptyStateV5 } from '../../domain/services/JoinReducer.js';
import WarpStateV5 from '../../domain/services/state/WarpStateV5.js';
import { projectStateV5 } from '../../domain/services/state/StateSerializerV5.js';

/**
 * CBOR-backed implementation of CheckpointStorePort.
 *
 * Owns the codec, crypto, and raw blob persistence. Domain services
 * pass WarpStateV5/VersionVector/Frontier objects in and get domain
 * objects back — no bytes leak across the port boundary.
 *
 * @extends CheckpointStorePort
 */
export class CborCheckpointStoreAdapter extends CheckpointStorePort {
  /**
   * Creates a new CborCheckpointStoreAdapter.
   *
   * @param {{
   *   codec: import('../../ports/CodecPort.js').default,
   *   blobPort: import('../../ports/BlobPort.js').default,
   *   crypto: import('../../ports/CryptoPort.js').default,
   * }} options
   */
  constructor({ codec, blobPort, crypto }) {
    super();
    /** @type {import('../../ports/CodecPort.js').default} */
    this._codec = codec;
    /** @type {import('../../ports/BlobPort.js').default} */
    this._blobPort = blobPort;
    /** @type {import('../../ports/CryptoPort.js').default} */
    this._crypto = crypto;
  }

  // ── Full V5 State ───────────────────────────────────────────────────

  /**
   * Serializes full V5 state (ORSets + props + VV + edgeBirthEvent)
   * to CBOR and persists as a blob.
   *
   * @param {import('../../domain/services/JoinReducer.js').WarpStateV5} state
   * @returns {Promise<string>} Blob OID
   */
  async writeState(state) {
    const bytes = this._encodeFullState(state);
    return await this._blobPort.writeBlob(bytes);
  }

  /**
   * Reads a blob by OID and decodes full V5 state from CBOR.
   *
   * @param {string} blobOid
   * @returns {Promise<import('../../domain/services/JoinReducer.js').WarpStateV5>}
   */
  async readState(blobOid) {
    const bytes = await this._blobPort.readBlob(blobOid);
    return this._decodeFullState(bytes);
  }

  // ── Applied Version Vector ──────────────────────────────────────────

  /**
   * Serializes a VersionVector to CBOR and persists as a blob.
   *
   * @param {import('../../domain/crdt/VersionVector.js').default} vv
   * @returns {Promise<string>} Blob OID
   */
  async writeAppliedVV(vv) {
    const obj = vvSerialize(vv);
    const bytes = this._codec.encode(obj);
    return await this._blobPort.writeBlob(bytes);
  }

  /**
   * Reads a blob by OID and decodes a VersionVector from CBOR.
   *
   * @param {string} blobOid
   * @returns {Promise<import('../../domain/crdt/VersionVector.js').default>}
   */
  async readAppliedVV(blobOid) {
    const bytes = await this._blobPort.readBlob(blobOid);
    const obj = /** @type {{ [x: string]: number }} */ (this._codec.decode(bytes));
    return VersionVector.from(obj);
  }

  // ── Frontier ────────────────────────────────────────────────────────

  /**
   * Serializes a frontier Map to CBOR and persists as a blob.
   *
   * @param {Map<string, string>} frontier
   * @returns {Promise<string>} Blob OID
   */
  async writeFrontier(frontier) {
    /** @type {Record<string, string|undefined>} */
    const obj = {};
    const sortedKeys = Array.from(frontier.keys()).sort();
    for (const key of sortedKeys) {
      obj[key] = frontier.get(key);
    }
    const bytes = this._codec.encode(obj);
    return await this._blobPort.writeBlob(bytes);
  }

  /**
   * Reads a blob by OID and decodes a frontier Map from CBOR.
   *
   * @param {string} blobOid
   * @returns {Promise<Map<string, string>>}
   */
  async readFrontier(blobOid) {
    const bytes = await this._blobPort.readBlob(blobOid);
    const obj = /** @type {Record<string, string>} */ (this._codec.decode(bytes));
    /** @type {Map<string, string>} */
    const frontier = new Map();
    for (const [writerId, patchSha] of Object.entries(obj)) {
      frontier.set(writerId, patchSha);
    }
    return frontier;
  }

  // ── State Hash ──────────────────────────────────────────────────────

  /**
   * Computes SHA-256 hash of the canonical visible state projection.
   *
   * @param {import('../../domain/services/JoinReducer.js').WarpStateV5} state
   * @returns {Promise<string>} Hex-encoded SHA-256 hash
   */
  async computeStateHash(state) {
    const projection = projectStateV5(state);
    const bytes = this._codec.encode(projection);
    return await this._crypto.hash('sha256', bytes);
  }

  // ── Internal Helpers ────────────────────────────────────────────────

  /**
   * Encodes full V5 state to CBOR bytes.
   *
   * @param {import('../../domain/services/JoinReducer.js').WarpStateV5} state
   * @returns {Uint8Array}
   * @private
   */
  _encodeFullState(state) {
    const nodeAliveObj = orsetSerialize(state.nodeAlive);
    const edgeAliveObj = orsetSerialize(state.edgeAlive);
    const propArray = _serializePropsArray(state.prop);
    const observedFrontierObj = vvSerialize(state.observedFrontier);
    const edgeBirthArray = _serializeEdgeBirthArray(state.edgeBirthEvent);

    return this._codec.encode({
      version: 'full-v5',
      nodeAlive: nodeAliveObj,
      edgeAlive: edgeAliveObj,
      prop: propArray,
      observedFrontier: observedFrontierObj,
      edgeBirthEvent: edgeBirthArray,
    });
  }

  /**
   * Decodes CBOR bytes to full V5 state.
   *
   * @param {Uint8Array} buffer
   * @returns {import('../../domain/services/JoinReducer.js').WarpStateV5}
   * @private
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
      nodeAlive: orsetDeserialize(obj['nodeAlive'] ?? {}),
      edgeAlive: orsetDeserialize(obj['edgeAlive'] ?? {}),
      prop: _deserializeProps(/** @type {[string, unknown][]} */ (obj['prop'])),
      observedFrontier: VersionVector.from(
        /** @type {{ [x: string]: number }} */ (obj['observedFrontier'] ?? {}),
      ),
      edgeBirthEvent: _deserializeEdgeBirthEvent(obj),
    });
  }
}

// ── Private Helpers (moved from CheckpointSerializerV5) ─────────────

/**
 * Serializes the props Map into a sorted array of [key, register] pairs.
 *
 * @param {Map<string, import('../../domain/crdt/LWW.js').LWWRegister<unknown>>} propMap
 * @returns {Array<[string, unknown]>}
 */
function _serializePropsArray(propMap) {
  /** @type {Array<[string, unknown]>} */
  const propArray = [];
  for (const [key, register] of propMap) {
    propArray.push([key, _serializeLWWRegister(register)]);
  }
  propArray.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return propArray;
}

/**
 * Serializes the edgeBirthEvent Map into a sorted array.
 *
 * @param {Map<string, import('../../domain/utils/EventId.js').EventId>|undefined} edgeBirthEvent
 * @returns {Array<[string, {lamport: number, writerId: string, patchSha: string, opIndex: number}]>}
 */
function _serializeEdgeBirthArray(edgeBirthEvent) {
  /** @type {Array<[string, {lamport: number, writerId: string, patchSha: string, opIndex: number}]>} */
  const result = [];
  if (edgeBirthEvent !== undefined && edgeBirthEvent !== null) {
    for (const [key, eventId] of edgeBirthEvent) {
      result.push([key, {
        lamport: eventId.lamport,
        writerId: eventId.writerId,
        patchSha: eventId.patchSha,
        opIndex: eventId.opIndex,
      }]);
    }
    result.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }
  return result;
}

/**
 * Deserializes the props array from checkpoint format.
 *
 * @param {Array<[string, unknown]>} propArray
 * @returns {Map<string, import('../../domain/crdt/LWW.js').LWWRegister<unknown>>}
 */
function _deserializeProps(propArray) {
  /** @type {Map<string, import('../../domain/crdt/LWW.js').LWWRegister<unknown>>} */
  const prop = new Map();
  if (!Array.isArray(propArray)) {
    return prop;
  }
  for (const [key, registerObj] of propArray) {
    const register = _deserializeLWWRegister(
      /** @type {{ eventId: { lamport: number, writerId: string, patchSha: string, opIndex: number }, value: unknown } | null} */ (registerObj),
    );
    if (register !== null) {
      prop.set(key, register);
    }
  }
  return prop;
}

/**
 * Deserializes edge birth event data, supporting both legacy and current formats.
 *
 * @param {Record<string, unknown>} obj
 * @returns {Map<string, import('../../domain/utils/EventId.js').EventId>}
 */
function _deserializeEdgeBirthEvent(obj) {
  /** @type {Map<string, import('../../domain/utils/EventId.js').EventId>} */
  const edgeBirthEvent = new Map();
  const birthData = obj['edgeBirthEvent'] ?? obj['edgeBirthLamport'];
  if (!Array.isArray(birthData)) {
    return edgeBirthEvent;
  }
  const typedBirthData = /** @type {Array<[string, unknown]>} */ (birthData);
  for (const [key, val] of typedBirthData) {
    if (typeof val === 'number') {
      edgeBirthEvent.set(key, { lamport: val, writerId: '', patchSha: '0000', opIndex: 0 });
    } else {
      const ev = /** @type {{lamport: number, writerId: string, patchSha: string, opIndex: number}} */ (val);
      edgeBirthEvent.set(key, {
        lamport: ev.lamport,
        writerId: ev.writerId,
        patchSha: ev.patchSha,
        opIndex: ev.opIndex,
      });
    }
  }
  return edgeBirthEvent;
}

/**
 * Serializes an LWW register for CBOR encoding.
 *
 * @param {import('../../domain/crdt/LWW.js').LWWRegister<unknown>} register
 * @returns {{ eventId: { lamport: number, opIndex: number, patchSha: string, writerId: string }, value: unknown } | null}
 */
function _serializeLWWRegister(register) {
  if (register === null || register === undefined) {
    return null;
  }
  return {
    eventId: {
      lamport: register.eventId.lamport,
      opIndex: register.eventId.opIndex,
      patchSha: register.eventId.patchSha,
      writerId: register.eventId.writerId,
    },
    value: register.value,
  };
}

/**
 * Deserializes an LWW register from CBOR.
 *
 * @param {{ eventId: { lamport: number, writerId: string, patchSha: string, opIndex: number }, value: unknown } | null} obj
 * @returns {import('../../domain/crdt/LWW.js').LWWRegister<unknown> | null}
 */
function _deserializeLWWRegister(obj) {
  if (obj === null || obj === undefined) {
    return null;
  }
  return {
    eventId: {
      lamport: obj.eventId.lamport,
      writerId: obj.eventId.writerId,
      patchSha: obj.eventId.patchSha,
      opIndex: obj.eventId.opIndex,
    },
    value: obj.value,
  };
}
