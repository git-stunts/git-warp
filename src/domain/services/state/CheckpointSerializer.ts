/**
 * Checkpoint serialization for the current WARP state
 *
 * Provides full state serialization including ORSet internals (entries + tombstones).
 * This is the AUTHORITATIVE checkpoint format for current state.
 *
 * Key differences from StateSerializer:
 * - StateSerializer serializes the VISIBLE PROJECTION (for hashing)
 * - CheckpointSerializer serializes the FULL INTERNAL STATE (for resume)
 *
 * @module CheckpointSerializer
 * @see WARP Spec Section 10 (Checkpoints)
 */

import type ORSet from '../../crdt/ORSet.ts';
import VersionVector from '../../crdt/VersionVector.ts';
import { decodeDot } from '../../crdt/Dot.ts';
import { requireCodec } from '../codec/CodecRequirement.ts';
import type { WarpState as WarpStateType } from '../JoinReducer.ts';
import WarpState from './WarpState.ts';
import SchemaUnsupportedError from '../../errors/SchemaUnsupportedError.ts';
import WarpError from '../../errors/WarpError.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type { LWWRegister } from '../../crdt/LWW.ts';
import { EventId } from '../../utils/EventId.ts';
import type { PropValue } from '../../types/PropValue.ts';
import { compareStrings } from '../../utils/StringComparison.ts';
import {
  deserializeORSet,
  serializeORSet,
  type ORSetWire,
} from './ORSetWireBoundary.ts';

interface SerializedLWWRegister {
  eventId: { lamport: number; opIndex: number; patchSha: string; writerId: string };
  value: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
}

// ============================================================================
// Full State Serialization (for Checkpoints)
// ============================================================================

/**
 * Serializes full state including ORSet internals (entries + tombstones).
 * This is the AUTHORITATIVE checkpoint format.
 */
export function serializeFullState(
  state: WarpStateType,
  { codec }: { codec?: CodecPort } = {},
): Uint8Array {
  const c = requireCodec(codec, 'serializeFullState');
  const nodeAliveObj = serializeORSet(state.nodeAlive);
  const edgeAliveObj = serializeORSet(state.edgeAlive);
  const propArray = serializePropsArray(WarpState.allPropEntriesFromState(state));
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

function serializePropsArray(propEntries: Iterable<readonly [string, LWWRegister<PropValue>]>): Array<[string, unknown]> { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  const propArray: Array<[string, unknown]> = []; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  for (const [key, register] of propEntries) {
    propArray.push([key, serializeLWWRegister(register)]);
  }
  propArray.sort((left, right) => compareStrings(left[0], right[0]));
  return propArray;
}

function serializeEdgeBirthArray(
  edgeBirthEvent: Map<string, EventId>,
): Array<[string, { lamport: number; writerId: string; patchSha: string; opIndex: number }]> {
  const result: Array<[string, { lamport: number; writerId: string; patchSha: string; opIndex: number }]> = [];
  for (const [key, eventId] of edgeBirthEvent) {
    result.push([key, { lamport: eventId.lamport, writerId: eventId.writerId, patchSha: eventId.patchSha, opIndex: eventId.opIndex }]);
  }
  result.sort((left, right) => compareStrings(left[0], right[0]));
  return result;
}

/**
 * Deserializes full state. Used for resume.
 */
export function deserializeFullState(
  buffer: Uint8Array,
  { codec: codecOpt }: { codec?: CodecPort } = {},
): WarpStateType {
  if (buffer === null || buffer === undefined) {
    throw new WarpError(
      'Checkpoint state buffer is missing',
      'E_CHECKPOINT_STATE_BUFFER_MISSING',
    );
  }
  const codec = requireCodec(codecOpt, 'deserializeFullState');
  const obj = codec.decode<DeserializedFullState | null | undefined>(buffer);
  if (obj === null || obj === undefined) {
    throw new WarpError(
      'Checkpoint state payload is missing',
      'E_CHECKPOINT_STATE_PAYLOAD_MISSING',
    );
  }
  if (obj.version !== undefined && obj.version !== 'full-v5') {
    throw new SchemaUnsupportedError(
      `Unsupported full state version: expected 'full-v5', got '${JSON.stringify(obj.version)}'`, // nosemgrep: ts-no-json-stringify-in-core -- 0025B
      { context: { version: obj.version } },
    );
  }
  return new WarpState({
    nodeAlive: deserializeORSet(obj.nodeAlive ?? {}),
    edgeAlive: deserializeORSet(obj.edgeAlive ?? {}),
    prop: deserializeProps(obj.prop ?? []),
    observedFrontier: VersionVector.from(obj.observedFrontier ?? {}),
    edgeBirthEvent: deserializeEdgeBirthEvent(obj),
  });
}

interface DeserializedFullState {
  version?: string;
  nodeAlive?: ORSetWire;
  edgeAlive?: ORSetWire;
  prop?: Array<[string, unknown]>; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  observedFrontier?: { [x: string]: number };
  edgeBirthEvent?: Array<[string, unknown]>; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
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
  const c = requireCodec(codec, 'serializeCheckpointStateEnvelope');
  return {
    nodeAlive: c.encode(serializeORSet(state.nodeAlive)),
    edgeAlive: c.encode(serializeORSet(state.edgeAlive)),
    prop: c.encode(serializePropsArray(WarpState.allPropEntriesFromState(state))),
    observedFrontier: c.encode(VersionVector.serialize(state.observedFrontier)),
    edgeBirthEvent: c.encode(serializeEdgeBirthArray(state.edgeBirthEvent)),
  };
}

export function deserializeCheckpointStateEnvelope(
  buffers: CheckpointStateEnvelopeBuffers,
  { codec }: { codec?: CodecPort } = {},
): WarpState {
  const c = requireCodec(codec, 'deserializeCheckpointStateEnvelope');
  const emptyORSet = { entries: [], tombstones: [] };
  return new WarpState({
    nodeAlive: deserializeORSet(decodeEnvelopeBlob(c, buffers.nodeAlive, emptyORSet)),
    edgeAlive: deserializeORSet(decodeEnvelopeBlob(c, buffers.edgeAlive, emptyORSet)),
    prop: deserializeProps(decodeEnvelopeBlob(c, buffers.prop, [])),
    observedFrontier: VersionVector.from(decodeEnvelopeBlob(c, buffers.observedFrontier, {})),
    edgeBirthEvent: deserializeCurrentEdgeBirthEvent(
      decodeEnvelopeBlob<CurrentEdgeBirthEventWire>(c, buffers.edgeBirthEvent, []),
    ),
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
  const c = requireCodec(codec, 'serializeAppliedVV');
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
  const c = requireCodec(codec, 'deserializeAppliedVV');
  const obj = c.decode<Record<string, number>>(buffer);
  return VersionVector.from(obj);
}

function deserializeProps(propArray: Array<[string, unknown]>): Map<string, LWWRegister<PropValue>> { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
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

interface CurrentEdgeBirthEventPayload {
  lamport: number;
  writerId: string;
  patchSha: string;
  opIndex: number;
}

type CurrentEdgeBirthEventWire = Array<[string, CurrentEdgeBirthEventPayload]>;

function deserializeCurrentEdgeBirthEvent(value: CurrentEdgeBirthEventWire): Map<string, EventId> {
  if (!Array.isArray(value)) {
    throw invalidCurrentEdgeBirthEvent('unknown');
  }
  const edgeBirthEvent = new Map<string, EventId>();
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw invalidCurrentEdgeBirthEvent('unknown');
    }
    const [key, payload] = entry;
    if (typeof key !== 'string' || !isCurrentEdgeBirthEventPayload(payload)) {
      throw invalidCurrentEdgeBirthEvent(typeof key === 'string' ? key : 'unknown');
    }
    try {
      edgeBirthEvent.set(
        key,
        new EventId(payload.lamport, payload.writerId, payload.patchSha, payload.opIndex),
      );
    } catch {
      throw invalidCurrentEdgeBirthEvent(key);
    }
  }
  return edgeBirthEvent;
}

function isCurrentEdgeBirthEventPayload(
  value: CurrentEdgeBirthEventPayload | null | undefined,
): value is CurrentEdgeBirthEventPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return typeof value.lamport === 'number'
    && typeof value.writerId === 'string'
    && typeof value.patchSha === 'string'
    && typeof value.opIndex === 'number';
}

function invalidCurrentEdgeBirthEvent(key: string): WarpError {
  return new WarpError(
    `Checkpoint edgeBirthEvent payload is invalid for ${key}`,
    'E_INVALID_CHECKPOINT_EDGE_BIRTH_EVENT',
  );
}

function deserializeSingleBirthEvent(val: unknown): { lamport: number; writerId: string; patchSha: string; opIndex: number } { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (typeof val === 'number') {
    return { lamport: val, writerId: '', patchSha: '0000', opIndex: 0 };
  }
  const ev = val as { lamport: number; writerId: string; patchSha: string; opIndex: number };
  return { lamport: ev.lamport, writerId: ev.writerId, patchSha: ev.patchSha, opIndex: ev.opIndex };
}

function serializeLWWRegister(register: LWWRegister<PropValue>): SerializedLWWRegister {
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
