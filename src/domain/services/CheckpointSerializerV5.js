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
 * @param {Object} [options]
 * @param {import('../../ports/CodecPort.js').default} [options.codec] - Codec for serialization
 * @returns {Buffer|Uint8Array} CBOR-encoded full state
 */
export function serializeFullStateV5(state, { codec } = /** @type {*} */ ({})) { // TODO(ts-cleanup): needs options type
  const c = codec || defaultCodec;
  // Serialize ORSets using existing serialization
  const nodeAliveObj = orsetSerialize(state.nodeAlive);
  const edgeAliveObj = orsetSerialize(state.edgeAlive);

  // Serialize props as sorted array of [key, register] pairs
  const propArray = [];
  for (const [key, register] of state.prop) {
    propArray.push([key, serializeLWWRegister(register)]);
  }
  // Sort by key for determinism
  propArray.sort((a, b) => {
    const keyA = /** @type {string} */ (a[0]);
    const keyB = /** @type {string} */ (b[0]);
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });

  // Serialize observedFrontier
  const observedFrontierObj = vvSerialize(state.observedFrontier);

  // Serialize edgeBirthEvent as sorted array of [edgeKey, eventId] pairs
  const edgeBirthArray = [];
  if (state.edgeBirthEvent) {
    for (const [key, eventId] of state.edgeBirthEvent) {
      edgeBirthArray.push([key, { lamport: eventId.lamport, writerId: eventId.writerId, patchSha: eventId.patchSha, opIndex: eventId.opIndex }]);
    }
    edgeBirthArray.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }

  const obj = {
    version: 'full-v5',
    nodeAlive: nodeAliveObj,
    edgeAlive: edgeAliveObj,
    prop: propArray,
    observedFrontier: observedFrontierObj,
    edgeBirthEvent: edgeBirthArray,
  };

  return c.encode(obj);
}

/**
 * Deserializes full V5 state. Used for resume.
 *
 * @param {Buffer|Uint8Array} buffer - CBOR-encoded full state
 * @param {Object} [options]
 * @param {import('../../ports/CodecPort.js').default} [options.codec] - Codec for deserialization
 * @returns {import('./JoinReducer.js').WarpStateV5}
 */
// eslint-disable-next-line complexity
export function deserializeFullStateV5(buffer, { codec: codecOpt } = /** @type {*} */ ({})) { // TODO(ts-cleanup): needs options type
  const codec = codecOpt || defaultCodec;
  // Handle null/undefined buffer before attempting decode
  if (buffer === null || buffer === undefined) {
    return createEmptyStateV5();
  }

  const obj = /** @type {Record<string, *>} */ (codec.decode(buffer));

  // Handle null/undefined decoded result: return empty state
  if (obj === null || obj === undefined) {
    return createEmptyStateV5();
  }

  // Handle version mismatch: throw with diagnostic info
  // Accept both 'full-v5' and missing version (for backward compatibility with pre-versioned data)
  if (obj.version !== undefined && obj.version !== 'full-v5') {
    throw new Error(
      `Unsupported full state version: expected 'full-v5', got '${obj.version}'`
    );
  }

  return {
    nodeAlive: orsetDeserialize(obj.nodeAlive || {}),
    edgeAlive: orsetDeserialize(obj.edgeAlive || {}),
    prop: deserializeProps(obj.prop),
    observedFrontier: vvDeserialize(obj.observedFrontier || {}),
    edgeBirthEvent: /** @type {Map<string, import('../utils/EventId.js').EventId>} */ (deserializeEdgeBirthEvent(obj)),
  };
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
  const vv = new Map();

  /**
   * Helper to scan all dots from an ORSet and update vv with max counters.
   * @param {import('../crdt/ORSet.js').ORSet} orset
   */
  function scanORSet(orset) {
    for (const dots of orset.entries.values()) {
      for (const encodedDot of dots) {
        const dot = decodeDot(encodedDot);
        const current = vv.get(dot.writerId) || 0;
        if (dot.counter > current) {
          vv.set(dot.writerId, dot.counter);
        }
      }
    }
  }

  // Scan nodeAlive entries
  scanORSet(state.nodeAlive);

  // Scan edgeAlive entries
  scanORSet(state.edgeAlive);

  return vv;
}

/**
 * Serializes appliedVV to CBOR format.
 *
 * @param {Map<string, number>} vv - Version vector (Map<writerId, counter>)
 * @param {Object} [options]
 * @param {import('../../ports/CodecPort.js').default} [options.codec] - Codec for serialization
 * @returns {Buffer|Uint8Array} CBOR-encoded version vector
 */
export function serializeAppliedVV(vv, { codec } = /** @type {*} */ ({})) { // TODO(ts-cleanup): needs options type
  const c = codec || defaultCodec;
  const obj = vvSerialize(vv);
  return c.encode(obj);
}

/**
 * Deserializes appliedVV from CBOR format.
 *
 * @param {Buffer|Uint8Array} buffer - CBOR-encoded version vector
 * @param {Object} [options]
 * @param {import('../../ports/CodecPort.js').default} [options.codec] - Codec for deserialization
 * @returns {Map<string, number>} Version vector
 */
export function deserializeAppliedVV(buffer, { codec } = /** @type {*} */ ({})) { // TODO(ts-cleanup): needs options type
  const c = codec || defaultCodec;
  const obj = /** @type {{ [x: string]: number }} */ (c.decode(buffer));
  return vvDeserialize(obj);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Deserializes the props array from checkpoint format.
 * @param {Array<*>} propArray - Array of [key, registerObj] pairs
 * @returns {Map<string, import('../crdt/LWW.js').LWWRegister<*>>}
 */
function deserializeProps(propArray) {
  const prop = new Map();
  if (propArray && Array.isArray(propArray)) {
    for (const [key, registerObj] of propArray) {
      prop.set(key, deserializeLWWRegister(registerObj));
    }
  }
  return prop;
}

/**
 * Deserializes edge birth event data, supporting both legacy and current formats.
 * @param {Record<string, *>} obj - The decoded checkpoint object
 * @returns {Map<string, import('../utils/EventId.js').EventId>}
 */
function deserializeEdgeBirthEvent(obj) {
  /** @type {Map<string, import('../utils/EventId.js').EventId>} */
  const edgeBirthEvent = new Map();
  const birthData = obj.edgeBirthEvent || obj.edgeBirthLamport;
  if (birthData && Array.isArray(birthData)) {
    for (const [key, val] of birthData) {
      if (typeof val === 'number') {
        // Legacy format: bare lamport number → synthesize minimal EventId.
        // Empty writerId and placeholder patchSha are sentinels indicating
        // this EventId was reconstructed from pre-v5 data, not a real writer.
        edgeBirthEvent.set(key, { lamport: val, writerId: '', patchSha: '0000', opIndex: 0 });
      } else {
        // Shallow copy to avoid sharing a reference with the decoded CBOR object
        edgeBirthEvent.set(key, { lamport: val.lamport, writerId: val.writerId, patchSha: val.patchSha, opIndex: val.opIndex });
      }
    }
  }
  return edgeBirthEvent;
}

/**
 * Serializes an LWW register for CBOR encoding.
 * EventId is serialized as a plain object with sorted keys.
 *
 * @param {import('../crdt/LWW.js').LWWRegister<*>} register
 * @returns {{ eventId: { lamport: number, opIndex: number, patchSha: string, writerId: string }, value: * } | null}
 */
function serializeLWWRegister(register) {
  if (!register) {
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
 * @param {{ eventId: { lamport: number, writerId: string, patchSha: string, opIndex: number }, value: * } | null} obj
 * @returns {import('../crdt/LWW.js').LWWRegister<*> | null}
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
