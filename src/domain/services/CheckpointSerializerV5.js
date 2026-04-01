/**
 * Checkpoint Serialization for WARP V5
 *
 * Provides full V5 state serialization including ORSet internals (entries + tombstones).
 * This is the AUTHORITATIVE checkpoint format for V5 state.
 *
 * Key differences from StateSerializerV5:
 * - StateSerializerV5 serializes the VISIBLE PROJECTION (for hashing)
 * - CheckpointSerializerV5 serializes the FULL INTERNAL STATE (for resume)
 *
 * @module CheckpointSerializerV5
 * @see WARP Spec Section 10 (Checkpoints)
 */

import defaultCodec from '../utils/defaultCodec.js';
import { orsetSerialize, orsetDeserialize } from '../crdt/ORSet.js';
import { vvSerialize, vvDeserialize } from '../crdt/VersionVector.js';
import { decodeDot } from '../crdt/Dot.js';
import { createEmptyStateV5 } from './JoinReducer.js';
import SchemaUnsupportedError from '../errors/SchemaUnsupportedError.js';

// ============================================================================
// Full State Serialization (for Checkpoints)
// ============================================================================

/**
 * Serializes full V5 state including ORSet internals (entries + tombstones).
 * This is the AUTHORITATIVE checkpoint format.
 *
 * Structure:
 * {
 *   nodeAlive: { entries: [[element, [dots...]], ...], tombstones: [dots...] },
 *   edgeAlive: { entries: [[element, [dots...]], ...], tombstones: [dots...] },
 *   prop: [[propKey, {eventId: {...}, value: ...}], ...],
 *   observedFrontier: { writerId: counter, ... }
 * }
 *
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @param {{ codec?: import('../../ports/CodecPort.js').default }} [options]
 * @returns {Uint8Array} CBOR-encoded full state
 */
export function serializeFullStateV5(state, { codec } = {}) {
  const c = codec || defaultCodec;
  const propArray = serializePropsArray(state.prop);
  const edgeBirthArray = serializeEdgeBirthArray(state.edgeBirthEvent);

  return c.encode({
    version: 'full-v5',
    nodeAlive: orsetSerialize(state.nodeAlive),
    edgeAlive: orsetSerialize(state.edgeAlive),
    prop: propArray,
    observedFrontier: vvSerialize(state.observedFrontier),
    edgeBirthEvent: edgeBirthArray,
  });
}

/**
 * Deserializes full V5 state. Used for resume.
 *
 * @param {Uint8Array} buffer - CBOR-encoded full state
 * @param {{ codec?: import('../../ports/CodecPort.js').default }} [options]
 * @returns {import('./JoinReducer.js').WarpStateV5}
 */
export function deserializeFullStateV5(buffer, { codec: codecOpt } = {}) {
  const codec = codecOpt || defaultCodec;
  const obj = decodeCheckpointBuffer(buffer, codec);
  if (obj === null) {
    return createEmptyStateV5();
  }
  validateCheckpointVersion(obj);
  return buildDeserializedState(obj);
}

/**
 * Decodes a CBOR buffer into a checkpoint object, returning null for absent or empty buffers.
 *
 * @param {Uint8Array} buffer - CBOR-encoded buffer, may be null or undefined
 * @param {import('../../ports/CodecPort.js').default} codec - CBOR codec
 * @returns {Record<string, unknown> | null} Decoded object or null
 */
function decodeCheckpointBuffer(buffer, codec) {
  if (buffer === null || buffer === undefined) {
    return null;
  }
  const obj = /** @type {Record<string, unknown>} */ (codec.decode(buffer));
  if (obj === null || obj === undefined) {
    return null;
  }
  return obj;
}

// ============================================================================
// AppliedVV Computation and Serialization
// ============================================================================

/**
 * Computes appliedVV by scanning all dots in state.
 * Scans state.nodeAlive.entries and state.edgeAlive.entries for all dots.
 * Returns Map<writerId, maxCounter>.
 *
 * CRITICAL: This scans ALL dots, including those that may be tombstoned.
 * The appliedVV represents what operations have been applied, not what is visible.
 *
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @returns {Map<string, number>} Map<writerId, maxCounter>
 */
export function computeAppliedVV(state) {
  /** @type {Map<string, number>} */
  const vv = new Map();

  /**
   * Helper to scan all dots from an ORSet and update vv with max counters.
   * @param {import('../crdt/ORSet.js').ORSet} orset
   */
  function scanORSet(orset) {
    for (const dots of orset.entries.values()) {
      for (const encodedDot of dots) {
        const dot = decodeDot(encodedDot);
        const current = vv.get(dot.writerId) ?? 0;
        if (dot.counter > current) {
          vv.set(dot.writerId, dot.counter);
        }
      }
    }
  }

  scanORSet(state.nodeAlive);
  scanORSet(state.edgeAlive);

  return vv;
}

/**
 * Serializes appliedVV to CBOR format.
 *
 * @param {Map<string, number>} vv - Version vector (Map<writerId, counter>)
 * @param {{ codec?: import('../../ports/CodecPort.js').default }} [options]
 * @returns {Uint8Array} CBOR-encoded version vector
 */
export function serializeAppliedVV(vv, { codec } = {}) {
  const c = codec || defaultCodec;
  const obj = vvSerialize(vv);
  return c.encode(obj);
}

/**
 * Deserializes appliedVV from CBOR format.
 *
 * @param {Uint8Array} buffer - CBOR-encoded version vector
 * @param {{ codec?: import('../../ports/CodecPort.js').default }} [options]
 * @returns {Map<string, number>} Version vector
 */
export function deserializeAppliedVV(buffer, { codec } = {}) {
  const c = codec || defaultCodec;
  const obj = /** @type {{ [x: string]: number }} */ (c.decode(buffer));
  return vvDeserialize(obj);
}

// ============================================================================
// Internal Helpers — Serialization
// ============================================================================

/**
 * Serializes the props Map into a deterministically sorted array of [key, register] pairs.
 *
 * @param {Map<string, import('../crdt/LWW.js').LWWRegister<unknown>>} propMap - Props map
 * @returns {Array<[string, unknown]>} Sorted serializable array
 */
function serializePropsArray(propMap) {
  /** @type {Array<[string, unknown]>} */
  const propArray = [];
  for (const [key, register] of propMap) {
    propArray.push([key, serializeLWWRegister(register)]);
  }
  propArray.sort((a, b) => {
    const keyA = /** @type {string} */ (a[0]);
    const keyB = /** @type {string} */ (b[0]);
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });
  return propArray;
}

/**
 * Serializes the edgeBirthEvent Map into a deterministically sorted array of [key, eventId] pairs.
 *
 * @param {Map<string, import('../utils/EventId.js').EventId>|undefined} edgeBirthEvent - Birth events
 * @returns {Array<[string, unknown]>} Sorted serializable array
 */
function serializeEdgeBirthArray(edgeBirthEvent) {
  /** @type {Array<[string, unknown]>} */
  const result = [];
  if (edgeBirthEvent === undefined || edgeBirthEvent === null) {
    return result;
  }
  for (const [key, eventId] of edgeBirthEvent) {
    result.push([key, { lamport: eventId.lamport, writerId: eventId.writerId, patchSha: eventId.patchSha, opIndex: eventId.opIndex }]);
  }
  result.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return result;
}

/**
 * Validates the checkpoint version field. Accepts 'full-v5' or missing version for backward compatibility.
 *
 * @param {Record<string, unknown>} obj - Decoded checkpoint object
 * @throws {SchemaUnsupportedError} If the version is present but not 'full-v5'
 */
function validateCheckpointVersion(obj) {
  if (obj.version !== undefined && obj.version !== 'full-v5') {
    const ver = /** @type {string} */ (obj.version);
    throw new SchemaUnsupportedError(
      `Unsupported full state version: expected 'full-v5', got '${ver}'`
    );
  }
}

/**
 * Builds the deserialized WarpStateV5 from a decoded checkpoint object.
 *
 * @param {Record<string, unknown>} obj - Decoded checkpoint object
 * @returns {import('./JoinReducer.js').WarpStateV5} Deserialized state
 */
function buildDeserializedState(obj) {
  return {
    nodeAlive: orsetDeserialize(fallbackToEmpty(obj.nodeAlive)),
    edgeAlive: orsetDeserialize(fallbackToEmpty(obj.edgeAlive)),
    prop: deserializeProps(/** @type {[string, unknown][]} */ (obj.prop)),
    observedFrontier: vvDeserialize(/** @type {{[x: string]: number}} */ (fallbackToEmpty(obj.observedFrontier))),
    edgeBirthEvent: /** @type {Map<string, import('../utils/EventId.js').EventId>} */ (deserializeEdgeBirthEvent(obj)),
  };
}

/**
 * Returns the value if non-nullish, otherwise an empty object. Used for checkpoint field defaults.
 *
 * @param {unknown} value - Value to check
 * @returns {unknown} The original value or an empty object
 */
function fallbackToEmpty(value) {
  if (value !== null && value !== undefined) {
    return value;
  }
  return {};
}

// ============================================================================
// Helper Functions — LWW Registers
// ============================================================================

/**
 * Deserializes the props array from checkpoint format.
 * @param {Array<[string, unknown]>} propArray - Array of [key, registerObj] pairs
 * @returns {Map<string, import('../crdt/LWW.js').LWWRegister<unknown>>}
 */
function deserializeProps(propArray) {
  /** @type {Map<string, import('../crdt/LWW.js').LWWRegister<unknown>>} */
  const prop = new Map();
  if (propArray !== null && propArray !== undefined && Array.isArray(propArray)) {
    for (const [key, registerObj] of propArray) {
      prop.set(key, deserializeLWWRegister(/** @type {{ eventId: { lamport: number, writerId: string, patchSha: string, opIndex: number }, value: unknown } | null} */ (registerObj)));
    }
  }
  return prop;
}

/**
 * Deserializes edge birth event data, supporting both legacy and current formats.
 * @param {Record<string, unknown>} obj - The decoded checkpoint object
 * @returns {Map<string, import('../utils/EventId.js').EventId>}
 */
function deserializeEdgeBirthEvent(obj) {
  /** @type {Map<string, import('../utils/EventId.js').EventId>} */
  const edgeBirthEvent = new Map();
  const birthData = resolveBirthData(obj);
  if (birthData !== null && birthData !== undefined && Array.isArray(birthData)) {
    for (const [key, val] of birthData) {
      edgeBirthEvent.set(key, parseBirthEntry(val));
    }
  }
  return edgeBirthEvent;
}

/**
 * Resolves edge birth data from the decoded checkpoint, supporting legacy field names.
 *
 * @param {Record<string, unknown>} obj - Decoded checkpoint object
 * @returns {unknown} The birth data array, or undefined if absent
 */
function resolveBirthData(obj) {
  if (obj.edgeBirthEvent !== undefined) {
    return obj.edgeBirthEvent;
  }
  return obj.edgeBirthLamport;
}

/**
 * Parses a single birth entry value into an EventId.
 *
 * Legacy format uses a bare lamport number; current format is a full EventId object.
 *
 * @param {unknown} val - The birth entry value (number or EventId-shaped object)
 * @returns {import('../utils/EventId.js').EventId} Parsed EventId
 */
function parseBirthEntry(val) {
  if (typeof val === 'number') {
    return { lamport: val, writerId: '', patchSha: '0000', opIndex: 0 };
  }
  const event = /** @type {{ lamport: number, writerId: string, patchSha: string, opIndex: number }} */ (val);
  return { lamport: event.lamport, writerId: event.writerId, patchSha: event.patchSha, opIndex: event.opIndex };
}

/**
 * Serializes an LWW register for CBOR encoding.
 * EventId is serialized as a plain object with sorted keys.
 *
 * @param {import('../crdt/LWW.js').LWWRegister<unknown>} register
 * @returns {{ eventId: { lamport: number, opIndex: number, patchSha: string, writerId: string }, value: unknown } | null}
 */
function serializeLWWRegister(register) {
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
 * @returns {import('../crdt/LWW.js').LWWRegister<unknown> | null}
 */
function deserializeLWWRegister(obj) {
  if (!obj) {
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
