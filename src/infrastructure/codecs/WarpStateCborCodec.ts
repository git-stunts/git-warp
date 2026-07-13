import type CodecPort from '../../ports/CodecPort.ts';
import type { LWWRegister } from '../../domain/crdt/LWW.ts';
import VersionVector from '../../domain/crdt/VersionVector.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import { createEmptyState } from '../../domain/services/JoinReducer.ts';
import WarpState from '../../domain/services/state/WarpState.ts';
import type { PropValue } from '../../domain/types/PropValue.ts';
import type { EventId } from '../../domain/utils/EventId.ts';
import {
  deserializeORSet,
  serializeORSet,
  type ORSetWire,
} from '../../domain/services/state/ORSetWireBoundary.ts';

const FULL_STATE_VERSION = 'full-v5';
const LEGACY_PATCH_SHA_PLACEHOLDER = '0000';

type EdgeBirthWire = {
  readonly writerId?: string;
  readonly lamport?: number;
  readonly patchSha?: string;
  readonly opIndex?: number;
};

interface DecodedFullState {
  version?: string;
  nodeAlive?: ORSetWire;
  edgeAlive?: ORSetWire;
  prop?: Array<[string, unknown]>;
  observedFrontier?: { [x: string]: number };
  edgeBirthEvent?: Array<[string, EdgeBirthWire]>;
  edgeBirthLamport?: Array<[string, number]>;
}

export function encodeWarpFullState(state: WarpState, codec: CodecPort): Uint8Array {
  return codec.encode({
    version: FULL_STATE_VERSION,
    nodeAlive: serializeORSet(state.nodeAlive),
    edgeAlive: serializeORSet(state.edgeAlive),
    prop: serializePropsArray(state.allPropEntries()),
    observedFrontier: VersionVector.serialize(state.observedFrontier),
    edgeBirthEvent: serializeEdgeBirthArray(state.edgeBirthEvent),
  });
}

export function decodeWarpFullState(buffer: Uint8Array, codec: CodecPort): WarpState {
  const obj = decodeFullStatePayload(buffer, codec);
  if (obj === null) {
    return createEmptyState();
  }
  assertSupportedFullStateVersion(obj.version);
  return hydrateWarpState(obj);
}

function decodeFullStatePayload(buffer: Uint8Array | null | undefined, codec: CodecPort): DecodedFullState | null {
  if (buffer === null || buffer === undefined) {
    return null;
  }
  const obj = codec.decode<DecodedFullState | null | undefined>(buffer);
  return obj ?? null;
}

function assertSupportedFullStateVersion(version: string | undefined): void {
  if (version === undefined || version === FULL_STATE_VERSION) {
    return;
  }
  throw new WarpError(
    `Unsupported full state version: expected '${FULL_STATE_VERSION}', got '${JSON.stringify(version)}'`,
    'E_UNSUPPORTED_VERSION',
  );
}

function hydrateWarpState(obj: DecodedFullState): WarpState {
  return new WarpState({
    nodeAlive: deserializeORSet(obj.nodeAlive ?? {}),
    edgeAlive: deserializeORSet(obj.edgeAlive ?? {}),
    prop: deserializeProps(obj.prop ?? []),
    observedFrontier: VersionVector.from(obj.observedFrontier ?? {}),
    edgeBirthEvent: deserializeEdgeBirthEvent(obj),
  });
}

function serializePropsArray(propEntries: Iterable<readonly [string, LWWRegister<unknown>]>): Array<[string, unknown]> {
  const arr: Array<[string, unknown]> = [];
  for (const [key, register] of propEntries) {
    arr.push([key, serializeLWWRegister(register)]);
  }
  arr.sort((left, right) => (
    left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0
  ));
  return arr;
}

function serializeEdgeBirthArray(
  edgeBirthEvent: Map<string, EventId> | undefined,
): Array<[string, { lamport: number; writerId: string; patchSha: string; opIndex: number }]> {
  const result: Array<[string, { lamport: number; writerId: string; patchSha: string; opIndex: number }]> = [];
  if (edgeBirthEvent !== undefined && edgeBirthEvent !== null) {
    for (const [key, eventId] of edgeBirthEvent) {
      result.push([key, {
        lamport: eventId.lamport,
        writerId: eventId.writerId,
        patchSha: eventId.patchSha,
        opIndex: eventId.opIndex,
      }]);
    }
    result.sort((left, right) => (
      left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0
    ));
  }
  return result;
}

function deserializeProps(propArray: Array<[string, unknown]>): Map<string, LWWRegister<PropValue>> {
  const prop = new Map<string, LWWRegister<PropValue>>();
  if (!Array.isArray(propArray)) {
    return prop;
  }
  for (const [key, registerObj] of propArray) {
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
  for (const [key, val] of birthData) {
    result.set(key, deserializeEdgeBirthValue(val));
  }
  return result;
}

function edgeBirthData(obj: DecodedFullState): Array<[string, EdgeBirthWire | number]> | undefined {
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
  register: LWWRegister<unknown>,
): { eventId: { lamport: number; opIndex: number; patchSha: string; writerId: string }; value: unknown } | null {
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

function deserializeLWWRegister(obj: unknown): LWWRegister<PropValue> | null {
  if (typeof obj !== 'object' || obj === null) {
    return null;
  }
  const wire = obj as { eventId?: unknown; value?: unknown };
  return {
    eventId: eventIdFromUnknown(wire.eventId),
    value: wire.value as PropValue,
  };
}

function eventIdFromUnknown(value: unknown): EventId {
  if (typeof value !== 'object' || value === null) {
    return legacyNumericEdgeBirth(0);
  }
  const wire = value as {
    lamport?: unknown;
    writerId?: unknown;
    patchSha?: unknown;
    opIndex?: unknown;
  };
  return {
    lamport: numberOrZero(wire.lamport),
    writerId: stringOr(wire.writerId, ''),
    patchSha: stringOr(wire.patchSha, LEGACY_PATCH_SHA_PLACEHOLDER),
    opIndex: numberOrZero(wire.opIndex),
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}
