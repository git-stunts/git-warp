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

import { encode, decode } from '../../infrastructure/codecs/CborCodec.js';
import { orsetSerialize, orsetDeserialize } from '../crdt/ORSet.js';
import { vvSerialize, vvDeserialize } from '../crdt/VersionVector.js';
import { decodeDot } from '../crdt/Dot.js';

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
 * @returns {Buffer} CBOR-encoded full state
 */
export function serializeFullStateV5(state) {
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
    const keyA = String(a[0]);
    const keyB = String(b[0]);
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });

  // Serialize observedFrontier
  const observedFrontierObj = vvSerialize(state.observedFrontier);

  const obj = {
    nodeAlive: nodeAliveObj,
    edgeAlive: edgeAliveObj,
    prop: propArray,
    observedFrontier: observedFrontierObj,
  };

  return encode(obj);
}

/**
 * Deserializes full V5 state. Used for resume.
 *
 * @param {Buffer} buffer - CBOR-encoded full state
 * @returns {import('./JoinReducer.js').WarpStateV5}
 */
export function deserializeFullStateV5(buffer) {
  const obj = decode(buffer);

  // Deserialize ORSets
  const nodeAlive = orsetDeserialize(obj.nodeAlive);
  const edgeAlive = orsetDeserialize(obj.edgeAlive);

  // Deserialize props
  const prop = new Map();
  if (obj.prop && Array.isArray(obj.prop)) {
    for (const [key, registerObj] of obj.prop) {
      prop.set(key, deserializeLWWRegister(registerObj));
    }
  }

  // Deserialize observedFrontier
  const observedFrontier = vvDeserialize(obj.observedFrontier || {});

  return { nodeAlive, edgeAlive, prop, observedFrontier };
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
 * @returns {Buffer} CBOR-encoded version vector
 */
export function serializeAppliedVV(vv) {
  const obj = vvSerialize(vv);
  return encode(obj);
}

/**
 * Deserializes appliedVV from CBOR format.
 *
 * @param {Buffer} buffer - CBOR-encoded version vector
 * @returns {Map<string, number>} Version vector
 */
export function deserializeAppliedVV(buffer) {
  const obj = decode(buffer);
  return vvDeserialize(obj);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Serializes an LWW register for CBOR encoding.
 * EventId is serialized as a plain object with sorted keys.
 *
 * @param {import('../crdt/LWW.js').LWWRegister} register
 * @returns {Object}
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
 * @param {Object} obj
 * @returns {import('../crdt/LWW.js').LWWRegister}
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
