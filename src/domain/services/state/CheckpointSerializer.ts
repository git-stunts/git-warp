/**
 * Checkpoint Serialization for WARP V5
 *
 * Provides full V5 state serialization including ORSet internals (entries + tombstones).
 * This is the AUTHORITATIVE checkpoint format for V5 state.
 *
 * Key differences from StateSerializer:
 * - StateSerializer serializes the VISIBLE PROJECTION (for hashing)
 * - CheckpointSerializer serializes the FULL INTERNAL STATE (for resume)
 *
 * @module CheckpointSerializer
 * @see WARP Spec Section 10 (Checkpoints)
 */

import defaultCodec from '../../utils/defaultCodec.ts';
import ORSet from '../../crdt/ORSet.ts';
import VersionVector from '../../crdt/VersionVector.ts';
import { decodeDot } from '../../crdt/Dot.ts';
import { createEmptyState, type WarpState as WarpStateType } from '../JoinReducer.ts';
import WarpState from './WarpState.ts';
import SchemaUnsupportedError from '../../errors/SchemaUnsupportedError.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type { LWWRegister } from '../../crdt/LWW.ts';
import type { EventId } from '../../utils/EventId.ts';
import type { PropValue } from '../../types/PropValue.ts';

interface SerializedLWWRegister {
  eventId: { lamport: number; opIndex: number; patchSha: string; writerId: string };
  value: unknown;
}

// ============================================================================
// Full State Serialization (for Checkpoints)
// ============================================================================

/**
 * Serializes full V5 state including ORSet internals (entries + tombstones).
 * This is the AUTHORITATIVE checkpoint format.
 */
export function serializeFullState(
  state: WarpStateType,
  { codec }: { codec?: CodecPort } = {},
): Uint8Array {
  const c = codec ?? defaultCodec;
  const nodeAliveObj = state.nodeAlive.serialize();
  const edgeAliveObj = state.edgeAlive.serialize();
  const propArray = serializePropsArray(state.prop);
  const observedFrontierObj = VersionVector.serialize(state.observedFrontier);
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

function serializePropsArray(propMap: Map<string, LWWRegister<PropValue>>): Array<[string, unknown]> {
  const propArray: Array<[string, unknown]> = [];
  for (const [key, register] of propMap) {
    propArray.push([key, serializeLWWRegister(register)]);
  }
  propArray.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return propArray;
}

function serializeEdgeBirthArray(
  edgeBirthEvent: Map<string, EventId> | undefined,
): Array<[string, { lamport: number; writerId: string; patchSha: string; opIndex: number }]> {
  const result: Array<[string, { lamport: number; writerId: string; patchSha: string; opIndex: number }]> = [];
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
 */
export function deserializeFullState(
  buffer: Uint8Array,
  { codec: codecOpt }: { codec?: CodecPort } = {},
): WarpStateType {
  const codec = codecOpt ?? defaultCodec;
  if (buffer === null || buffer === undefined) {
    return createEmptyState();
  }
  const obj = codec.decode<DeserializedFullState | null | undefined>(buffer);
  if (obj === null || obj === undefined) {
    return createEmptyState();
  }
  if (obj.version !== undefined && obj.version !== 'full-v5') {
    throw new SchemaUnsupportedError(
      `Unsupported full state version: expected 'full-v5', got '${JSON.stringify(obj.version)}'`,
      { context: { version: obj.version } },
    );
  }
  return new WarpState({
    nodeAlive: ORSet.deserialize(obj.nodeAlive ?? {}),
    edgeAlive: ORSet.deserialize(obj.edgeAlive ?? {}),
    prop: deserializeProps(obj.prop ?? []),
    observedFrontier: VersionVector.from(obj.observedFrontier ?? {}),
    edgeBirthEvent: deserializeEdgeBirthEvent(obj),
  });
}

interface DeserializedFullState {
  version?: string;
  nodeAlive?: { [x: string]: string[] };
  edgeAlive?: { [x: string]: string[] };
  prop?: Array<[string, unknown]>;
  observedFrontier?: { [x: string]: number };
  edgeBirthEvent?: Array<[string, unknown]>;
  edgeBirthLamport?: Array<[string, number]>;
}

export interface CheckpointStateEnvelopeBuffers {
  nodeAlive: Uint8Array;
  edgeAlive: Uint8Array;
  prop: Uint8Array;
  observedFrontier: Uint8Array;
  edgeBirthEvent: Uint8Array;
}

export function serializeCheckpointStateEnvelope(
  state: WarpStateType,
  { codec }: { codec?: CodecPort } = {},
): CheckpointStateEnvelopeBuffers {
  const c = codec ?? defaultCodec;
  return {
    nodeAlive: c.encode(state.nodeAlive.serialize()),
    edgeAlive: c.encode(state.edgeAlive.serialize()),
    prop: c.encode(serializePropsArray(state.prop)),
    observedFrontier: c.encode(VersionVector.serialize(state.observedFrontier)),
    edgeBirthEvent: c.encode(serializeEdgeBirthArray(state.edgeBirthEvent)),
  };
}

export function deserializeCheckpointStateEnvelope(
  buffers: CheckpointStateEnvelopeBuffers,
  { codec }: { codec?: CodecPort } = {},
): WarpStateType {
  const c = codec ?? defaultCodec;
  const emptyORSet = { entries: [], tombstones: [] };
  return new WarpState({
    nodeAlive: ORSet.deserialize(decodeEnvelopeBlob(c, buffers.nodeAlive, emptyORSet)),
    edgeAlive: ORSet.deserialize(decodeEnvelopeBlob(c, buffers.edgeAlive, emptyORSet)),
    prop: deserializeProps(decodeEnvelopeBlob(c, buffers.prop, [])),
    observedFrontier: VersionVector.from(decodeEnvelopeBlob(c, buffers.observedFrontier, {})),
    edgeBirthEvent: deserializeEdgeBirthEvent({
      edgeBirthEvent: decodeEnvelopeBlob(c, buffers.edgeBirthEvent, []),
    }),
  });
}

function decodeEnvelopeBlob<TDecoded>(
  codec: CodecPort,
  buffer: Uint8Array,
  fallback: TDecoded,
): TDecoded {
  if (buffer.byteLength === 0) {
    return fallback;
  }
  return codec.decode<TDecoded>(buffer);
}

// ============================================================================
// AppliedVV Computation and Serialization
// ============================================================================

/**
 * Computes appliedVV by scanning all dots in state.
 * Walks `nodeAlive` and `edgeAlive` via the ORSet's entryDotsIter.
 * Returns Map<writerId, maxCounter>.
 *
 * CRITICAL: This scans ALL entry dots, including tombstoned ones.
 * The appliedVV represents what operations have been applied, not what is visible.
 */
export function computeAppliedVV(state: WarpStateType): VersionVector {
  const vv = VersionVector.empty();

  function scanORSet(orset: ORSet): void {
    for (const encodedDot of orset.entryDotsIter()) {
      const dot = decodeDot(encodedDot);
      const current = vv.get(dot.writerId) ?? 0;
      if (dot.counter > current) {
        vv.set(dot.writerId, dot.counter);
      }
    }
  }

  scanORSet(state.nodeAlive);
  scanORSet(state.edgeAlive);

  return vv;
}

/**
 * Serializes appliedVV to CBOR format.
 */
export function serializeAppliedVV(
  vv: VersionVector,
  { codec }: { codec?: CodecPort } = {},
): Uint8Array {
  const c = codec ?? defaultCodec;
  const obj = VersionVector.serialize(vv);
  return c.encode(obj);
}

/**
 * Deserializes appliedVV from CBOR format.
 */
export function deserializeAppliedVV(
  buffer: Uint8Array,
  { codec }: { codec?: CodecPort } = {},
): VersionVector {
  const c = codec ?? defaultCodec;
  const obj = c.decode<Record<string, number>>(buffer);
  return VersionVector.from(obj);
}

// ============================================================================
// Helper Functions
// ============================================================================

function deserializeProps(propArray: Array<[string, unknown]>): Map<string, LWWRegister<PropValue>> {
  const prop = new Map<string, LWWRegister<PropValue>>();
  if (!Array.isArray(propArray)) { return prop; }
  for (const [key, registerObj] of propArray) {
    const register = deserializeLWWRegister(registerObj as SerializedLWWRegister | null);
    if (register !== null) {
      prop.set(key, register);
    }
  }
  return prop;
}

function deserializeEdgeBirthEvent(obj: DeserializedFullState): Map<string, EventId> {
  const edgeBirthEvent = new Map<string, EventId>();
  const birthData = obj.edgeBirthEvent ?? obj.edgeBirthLamport;
  if (!Array.isArray(birthData)) { return edgeBirthEvent; }
  for (const [key, val] of birthData) {
    edgeBirthEvent.set(key, deserializeSingleBirthEvent(val));
  }
  return edgeBirthEvent;
}

function deserializeSingleBirthEvent(val: unknown): { lamport: number; writerId: string; patchSha: string; opIndex: number } {
  if (typeof val === 'number') {
    return { lamport: val, writerId: '', patchSha: '0000', opIndex: 0 };
  }
  const ev = val as { lamport: number; writerId: string; patchSha: string; opIndex: number };
  return { lamport: ev.lamport, writerId: ev.writerId, patchSha: ev.patchSha, opIndex: ev.opIndex };
}

function serializeLWWRegister(register: LWWRegister<PropValue>): SerializedLWWRegister | null {
  if (register === null || register === undefined) { return null; }
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

function deserializeLWWRegister(obj: SerializedLWWRegister | null): LWWRegister<PropValue> | null {
  if (obj === null || obj === undefined) { return null; }
  return {
    eventId: {
      lamport: obj.eventId.lamport,
      writerId: obj.eventId.writerId,
      patchSha: obj.eventId.patchSha,
      opIndex: obj.eventId.opIndex,
    },
    // Codec boundary: deserialized value is typed as PropValue
    value: obj.value as PropValue,
  };
}
