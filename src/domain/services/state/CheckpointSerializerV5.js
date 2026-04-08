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

import defaultCodec from '../../utils/defaultCodec.ts';
import { orsetSerialize, orsetDeserialize } from '../../crdt/ORSet.js';
import VersionVector, { vvSerialize } from '../../crdt/VersionVector.js';
import { decodeDot } from '../../crdt/Dot.js';
import { createEmptyStateV5 } from '../JoinReducer.js';
import WarpStateV5 from './WarpStateV5.js';

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
 * @param {import('../JoinReducer.js').WarpStateV5} state
 * @param {{ codec?: import('../../../ports/CodecPort.js').default }} [options]
 * @returns {Uint8Array} CBOR-encoded full state
 */
export function serializeFullStateV5(state, { codec } = {}) {
  const c = codec ?? defaultCodec;
  const nodeAliveObj = orsetSerialize(state.nodeAlive);
  const edgeAliveObj = orsetSerialize(state.edgeAlive);
  const propArray = serializePropsArray(state.prop);
  const observedFrontierObj = vvSerialize(state.observedFrontier);
  const edgeBirthArray = serializeEdgeBirthArray(state.edgeBirthEvent);

  return c.encode({
    version: 'full-v5',
    nodeAlive: nodeAliveObj,
    edgeAlive: edgeAliveObj,
    prop: propArray,
    observedFrontier: observedFrontierObj,
    edgeBirthEvent: edgeBirthArray,
  });
}

/**
 * Serializes the props Map into a sorted array of [key, register] pairs.
 * @param {Map<string, import('../../crdt/LWW.js').LWWRegister<unknown>>} propMap
 * @returns {Array<[string, unknown]>}
 */
function serializePropsArray(propMap) {
  /** @type {Array<[string, unknown]>} */
  const propArray = [];
  for (const [key, register] of propMap) {
    propArray.push([key, serializeLWWRegister(register)]);
  }
  propArray.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return propArray;
}

/**
 * Serializes the edgeBirthEvent Map into a sorted array.
 * @param {Map<string, import('../../utils/EventId.ts').EventId>|undefined} edgeBirthEvent
 * @returns {Array<[string, {lamport: number, writerId: string, patchSha: string, opIndex: number}]>}
 */
function serializeEdgeBirthArray(edgeBirthEvent) {
  /** @type {Array<[string, {lamport: number, writerId: string, patchSha: string, opIndex: number}]>} */
  const result = [];
  if (edgeBirthEvent !== undefined && edgeBirthEvent !== null) {
    for (const [key, eventId] of edgeBirthEvent) {
      result.push([key, { lamport: eventId.lamport, writerId: eventId.writerId, patchSha: eventId.patchSha, opIndex: eventId.opIndex }]);
    }
    result.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }
  return result;
}

/**
 * Deserializes full V5 state. Used for resume.
 *
 * @param {Uint8Array} buffer - CBOR-encoded full state
 * @param {{ codec?: import('../../../ports/CodecPort.js').default }} [options]
 * @returns {import('../JoinReducer.js').WarpStateV5}
 */
export function deserializeFullStateV5(buffer, { codec: codecOpt } = {}) {
  const codec = codecOpt ?? defaultCodec;
  if (buffer === null || buffer === undefined) {
    return createEmptyStateV5();
  }
  const obj = /** @type {Record<string, unknown>} */ (codec.decode(buffer));
  if (obj === null || obj === undefined) {
    return createEmptyStateV5();
  }
  // Accept both 'full-v5' and missing version (backward compat with pre-versioned data)
  if (obj['version'] !== undefined && obj['version'] !== 'full-v5') {
    throw new Error(`Unsupported full state version: expected 'full-v5', got '${JSON.stringify(obj['version'])}'`);
  }
  return new WarpStateV5({
    nodeAlive: orsetDeserialize(obj['nodeAlive'] ?? {}),
    edgeAlive: orsetDeserialize(obj['edgeAlive'] ?? {}),
    prop: deserializeProps(/** @type {[string, unknown][]} */ (obj['prop'])),
    observedFrontier: VersionVector.from(/** @type {{[x: string]: number}} */ (obj['observedFrontier'] ?? {})),
    edgeBirthEvent: /** @type {Map<string, import('../../utils/EventId.ts').EventId>} */ (deserializeEdgeBirthEvent(obj)),
  });
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
 * @param {import('../JoinReducer.js').WarpStateV5} state
 * @returns {VersionVector}
 */
export function computeAppliedVV(state) {
  const vv = VersionVector.empty();

  /**
   * Helper to scan all dots from an ORSet and update vv with max counters.
   * @param {import('../../crdt/ORSet.js').default} orset
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

  // Scan nodeAlive entries
  scanORSet(state.nodeAlive);

  // Scan edgeAlive entries
  scanORSet(state.edgeAlive);

  return vv;
}

/**
 * Serializes appliedVV to CBOR format.
 *
 * @param {VersionVector} vv
 * @param {{ codec?: import('../../../ports/CodecPort.js').default }} [options]
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
 * @param {{ codec?: import('../../../ports/CodecPort.js').default }} [options]
 * @returns {VersionVector}
 */
export function deserializeAppliedVV(buffer, { codec } = {}) {
  const c = codec || defaultCodec;
  const obj = /** @type {{ [x: string]: number }} */ (c.decode(buffer));
  return VersionVector.from(obj);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Deserializes the props array from checkpoint format.
 * @param {Array<[string, unknown]>} propArray - Array of [key, registerObj] pairs
 * @returns {Map<string, import('../../crdt/LWW.js').LWWRegister<unknown>>}
 */
function deserializeProps(propArray) {
  /** @type {Map<string, import('../../crdt/LWW.js').LWWRegister<unknown>>} */
  const prop = new Map();
  if (!Array.isArray(propArray)) {
    return prop;
  }
  for (const [key, registerObj] of propArray) {
    const register = deserializeLWWRegister(/** @type {{ eventId: { lamport: number, writerId: string, patchSha: string, opIndex: number }, value: unknown } | null} */ (registerObj));
    if (register !== null) {
      prop.set(key, register);
    }
  }
  return prop;
}

/**
 * Deserializes edge birth event data, supporting both legacy and current formats.
 * @param {Record<string, unknown>} obj - The decoded checkpoint object
 * @returns {Map<string, import('../../utils/EventId.ts').EventId>}
 */
function deserializeEdgeBirthEvent(obj) {
  /** @type {Map<string, import('../../utils/EventId.ts').EventId>} */
  const edgeBirthEvent = new Map();
  const birthData = obj['edgeBirthEvent'] ?? obj['edgeBirthLamport'];
  if (!Array.isArray(birthData)) {
    return edgeBirthEvent;
  }
  for (const [key, val] of birthData) {
    edgeBirthEvent.set(key, deserializeSingleBirthEvent(val));
  }
  return edgeBirthEvent;
}

/**
 * Converts a single birth event entry from its serialized form.
 * Supports both legacy (bare lamport number) and current (object) formats.
 * @param {unknown} val - The serialized birth event value
 * @returns {import('../../utils/EventId.ts').EventId}
 */
function deserializeSingleBirthEvent(val) {
  if (typeof val === 'number') {
    return { lamport: val, writerId: '', patchSha: '0000', opIndex: 0 };
  }
  const ev = /** @type {{lamport: number, writerId: string, patchSha: string, opIndex: number}} */ (val);
  return { lamport: ev.lamport, writerId: ev.writerId, patchSha: ev.patchSha, opIndex: ev.opIndex };
}

/**
 * Serializes an LWW register for CBOR encoding.
 * EventId is serialized as a plain object with sorted keys.
 *
 * @param {import('../../crdt/LWW.js').LWWRegister<unknown>} register
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
 * @returns {import('../../crdt/LWW.js').LWWRegister<unknown> | null}
 */
function deserializeLWWRegister(obj) {
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
