import z from 'zod';
import CborFullStateLifecycleDecoder from './CborFullStateLifecycleDecoder.ts';
import type { FullStateLifecycle } from '../../ports/FullStateLifecycleDecoderPort.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type { LWWRegister } from '../../domain/crdt/LWW.ts';
import { compareStrings } from '../../domain/utils/StringComparison.ts';
import VersionVector from '../../domain/crdt/VersionVector.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import { createEmptyState } from '../../domain/services/JoinReducer.ts';
import WarpState, { type WarpStateFields } from '../../domain/services/state/WarpState.ts';
import { isPropValue, type PropValue } from '../../domain/types/PropValue.ts';
import { compareEventIds, type EventId } from '../../domain/utils/EventId.ts';
import { mergeNodeLifecycles } from '../../domain/services/state/NodeLifecycle.ts';
import {
  deserializeORSet,
  serializeORSet,
} from '../../domain/services/state/ORSetWireBoundary.ts';

/** Current full-state interpretation: immediate node-wide LWW property clears. */
const FULL_STATE_VERSION = 'full-v7';
/** Previous version, still read: it carries no node or remove events. */
const LEGACY_FULL_STATE_VERSION = 'full-v5';
const LEGACY_PATCH_SHA_PLACEHOLDER = '0000';

type FullStateVersion = typeof FULL_STATE_VERSION | typeof LEGACY_FULL_STATE_VERSION;

type EventWire = { lamport: number; writerId: string; patchSha: string; opIndex: number };

const OR_SET_WIRE = z.object({
  entries: z.array(z.tuple([z.string(), z.array(z.string())])).optional(),
  tombstones: z.array(z.string()).optional(),
});
const EDGE_BIRTH_WIRE = z.object({
  writerId: z.string().optional(), lamport: z.number().optional(),
  patchSha: z.string().optional(), opIndex: z.number().optional(),
});
type EdgeBirthWire = z.infer<typeof EDGE_BIRTH_WIRE>;
const FULL_STATE_ENVELOPE = z.object({
  version: z.string().optional(),
  nodeAlive: OR_SET_WIRE.optional(), edgeAlive: OR_SET_WIRE.optional(),
  prop: z.unknown(),
  observedFrontier: z.record(z.string(), z.number()).optional(),
  edgeBirthEvent: z.unknown(), edgeBirthLamport: z.unknown(),
});
type DecodedFullState = z.infer<typeof FULL_STATE_ENVELOPE>;
const PROPERTY_ENTRY = z.tuple([z.string(), z.unknown()]);
const EDGE_BIRTH_ENTRY = z.tuple([z.string(), z.union([z.number(), EDGE_BIRTH_WIRE])]);

function decodeEnvelope(value: unknown): DecodedFullState {
  const parsed = FULL_STATE_ENVELOPE.safeParse(value);
  if (!parsed.success) {
    throw invalidCanonicalFullState();
  }
  return parsed.data;
}

export function encodeWarpFullState(state: WarpState, codec: CodecPort): Uint8Array {
  return encodeFullStateVersion(state, codec, FULL_STATE_VERSION);
}

function encodeFullStateVersion(state: WarpState, codec: CodecPort, version: FullStateVersion): Uint8Array {
  const legacyFields = {
    nodeAlive: serializeORSet(state.nodeAlive),
    edgeAlive: serializeORSet(state.edgeAlive),
    prop: serializePropsArray(state.allPropEntries()),
    observedFrontier: VersionVector.serialize(state.observedFrontier),
    edgeBirthEvent: serializeEventArray(state.edgeBirthEvent),
  };
  if (version === LEGACY_FULL_STATE_VERSION) {
    return codec.encode({ version, ...legacyFields });
  }
  return codec.encode({
    version,
    ...legacyFields,
    nodeBirthEvent: serializeEventArray(state.nodeBirthEvent),
    nodeClearEvent: serializeEventArray(state.nodeClearEvent),
    nodePendingRemoveEvents: serializeEventListArray(state.nodePendingRemoveEvents),
    edgeRemoveEvent: serializeEventArray(state.edgeRemoveEvent),
  });
}

export function decodeWarpFullState(buffer: Uint8Array | null | undefined, codec: CodecPort): WarpState {
  if (buffer === null || buffer === undefined) {
    return createEmptyState();
  }
  const obj = decodeFullStatePayload(buffer, codec);
  if (obj === null) {
    return createEmptyState();
  }
  assertSupportedFullStateVersion(obj.version);
  const lifecycle = obj.version === FULL_STATE_VERSION
    ? new CborFullStateLifecycleDecoder(codec).decode(buffer)
    : null;
  return hydrateWarpState(obj, lifecycle);
}

/**
 * Decode only a canonical full-state envelope: the current version as
 * encodeWarpFullState writes it, or a full-v5 envelope as the previous
 * encoder wrote it. Either must re-encode to the same bytes.
 */
export function decodeCanonicalWarpFullState(buffer: Uint8Array, codec: CodecPort): WarpState {
  const decoded = decodeEnvelope(codec.decode(buffer));
  if (!isCanonicalVersion(decoded.version)) {
    throw invalidCanonicalFullState();
  }
  const lifecycle = canonicalLifecycle(buffer, codec, decoded.version);
  const state = hydrateWarpState(decoded, lifecycle);
  if (!equalBytes(buffer, encodeFullStateVersion(state, codec, decoded.version))) {
    throw invalidCanonicalFullState();
  }
  return state;
}

function canonicalLifecycle(
  buffer: Uint8Array, codec: CodecPort, version: FullStateVersion,
): FullStateLifecycle | null {
  let lifecycle: FullStateLifecycle | null = null;
  if (version === FULL_STATE_VERSION) {
    try {
      lifecycle = new CborFullStateLifecycleDecoder(codec).decode(buffer);
    } catch (error) {
      if (error instanceof WarpError && error.code === 'E_INVALID_FULL_STATE_LIFECYCLE') {
        throw invalidCanonicalFullState();
      }
      throw error;
    }
  }
  return lifecycle;
}

function isCanonicalVersion(version: unknown): version is FullStateVersion {
  return version === FULL_STATE_VERSION || version === LEGACY_FULL_STATE_VERSION;
}

function decodeFullStatePayload(buffer: Uint8Array, codec: CodecPort): DecodedFullState | null {
  const obj = codec.decode(buffer);
  return obj === null || obj === undefined ? null : decodeEnvelope(obj);
}

function assertSupportedFullStateVersion(version: string | undefined): void {
  if (version === undefined || isCanonicalVersion(version)) {
    return;
  }
  throw new WarpError(
    `Unsupported full state version: expected '${LEGACY_FULL_STATE_VERSION}' or '${FULL_STATE_VERSION}', got '${JSON.stringify(version)}'`,
    'E_UNSUPPORTED_VERSION',
  );
}

function hydrateWarpState(obj: DecodedFullState, lifecycle: FullStateLifecycle | null): WarpState {
  const legacyFields = hydrateLegacyFields(obj);
  if (lifecycle === null) {
    return new WarpState(legacyFields);
  }
  return new WarpState({
    ...legacyFields,
    ...mergeNodeLifecycles({}, lifecycle),
    edgeRemoveEvent: lifecycle.edgeRemoveEvent,
  });
}

/** The fields every full-state version carries. */
function hydrateLegacyFields(obj: DecodedFullState): WarpStateFields {
  return {
    nodeAlive: decodeAliveSet(obj.nodeAlive),
    edgeAlive: decodeAliveSet(obj.edgeAlive),
    prop: deserializeProps(obj.prop ?? []),
    observedFrontier: VersionVector.from(obj.observedFrontier ?? {}),
    edgeBirthEvent: deserializeEdgeBirthEvent(obj),
  };
}

function decodeAliveSet(wire: z.infer<typeof OR_SET_WIRE> | undefined) {
  return deserializeORSet({ entries: wire?.entries ?? [], tombstones: wire?.tombstones ?? [] });
}

function serializePropsArray(propEntries: Iterable<readonly [string, LWWRegister<PropValue>]>): Array<[string, unknown]> {
  const arr: Array<[string, unknown]> = [];
  for (const [key, register] of propEntries) {
    arr.push([key, serializeLWWRegister(register)]);
  }
  arr.sort(compareWireKeys);
  return arr;
}

function eventWire(eventId: EventId): EventWire {
  return {
    lamport: eventId.lamport,
    writerId: eventId.writerId,
    patchSha: eventId.patchSha,
    opIndex: eventId.opIndex,
  };
}

function compareWireKeys<T>(left: readonly [string, T], right: readonly [string, T]): number {
  return compareStrings(left[0], right[0]);
}

function serializeEventArray(events: ReadonlyMap<string, EventId>): Array<[string, EventWire]> {
  const result: Array<[string, EventWire]> = [];
  for (const [key, eventId] of events) {
    result.push([key, eventWire(eventId)]);
  }
  return result.sort(compareWireKeys);
}

function serializeEventListArray(events: ReadonlyMap<string, readonly EventId[]>): Array<[string, EventWire[]]> {
  const result: Array<[string, EventWire[]]> = [];
  for (const [key, eventIds] of events) {
    result.push([key, [...eventIds].sort(compareEventIds).map(eventWire)]);
  }
  return result.sort(compareWireKeys);
}

function deserializeProps(propArray: unknown): Map<string, LWWRegister<PropValue>> {
  const prop = new Map<string, LWWRegister<PropValue>>();
  if (!Array.isArray(propArray)) {
    return prop;
  }
  for (const entry of propArray) {
    const parsed = PROPERTY_ENTRY.safeParse(entry);
    if (!parsed.success) {
      throw invalidCanonicalFullState();
    }
    const [key, registerObj] = parsed.data;
    const register = deserializeLWWRegister(registerObj);
    if (register !== null) {
      prop.set(key, register);
    }
  }
  return prop;
}

function deserializeEdgeBirthEvent(obj: DecodedFullState): Map<string, EventId> {
  const result = new Map<string, EventId>();
  const birthData = edgeBirthData(obj);
  if (!Array.isArray(birthData)) {
    return result;
  }
  for (const entry of birthData) {
    const parsed = EDGE_BIRTH_ENTRY.safeParse(entry);
    if (!parsed.success) {
      throw invalidCanonicalFullState();
    }
    const [key, val] = parsed.data;
    result.set(key, deserializeEdgeBirthValue(val));
  }
  return result;
}

function edgeBirthData(obj: DecodedFullState): unknown {
  return obj.edgeBirthEvent ?? obj.edgeBirthLamport;
}

function deserializeEdgeBirthValue(value: EdgeBirthWire | number): EventId {
  if (typeof value === 'number') {
    return legacyNumericEdgeBirth(value);
  }
  return edgeBirthWireToEventId(value);
}

function legacyNumericEdgeBirth(lamport: number): EventId {
  return { lamport, writerId: '', patchSha: LEGACY_PATCH_SHA_PLACEHOLDER, opIndex: 0 };
}

function edgeBirthWireToEventId(value: EdgeBirthWire): EventId {
  return {
    lamport: value.lamport ?? 0,
    writerId: value.writerId ?? '',
    patchSha: value.patchSha ?? LEGACY_PATCH_SHA_PLACEHOLDER,
    opIndex: value.opIndex ?? 0,
  };
}

function serializeLWWRegister(
  register: LWWRegister<PropValue>,
): { eventId: { lamport: number; opIndex: number; patchSha: string; writerId: string }; value: PropValue } {
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

function deserializeLWWRegister(obj: unknown): LWWRegister<PropValue> | null {
  if (typeof obj !== 'object' || obj === null) {
    return null;
  }
  return {
    eventId: eventIdFromUnknown('eventId' in obj ? obj.eventId : undefined),
    value: propertyValue(obj),
  };
}

function propertyValue(obj: object): PropValue {
  if (!('value' in obj) || !isPropValue(obj.value)) {
    throw invalidCanonicalFullState();
  }
  return obj.value;
}

function eventIdFromUnknown(value: unknown): EventId {
  if (!isRecord(value)) {
    return legacyNumericEdgeBirth(0);
  }
  return {
    lamport: numberOrZero(value['lamport']),
    writerId: stringOr(value['writerId'], ''),
    patchSha: stringOr(value['patchSha'], LEGACY_PATCH_SHA_PLACEHOLDER),
    opIndex: numberOrZero(value['opIndex']),
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function invalidCanonicalFullState(): WarpError {
  return new WarpError('Full state payload is not canonical', 'E_FULL_STATE_INVALID');
}
