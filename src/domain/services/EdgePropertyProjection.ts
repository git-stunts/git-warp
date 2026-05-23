import EdgeRecord from '../graph/EdgeRecord.ts';
import LegacyEdgePropertyKey from '../graph/LegacyEdgePropertyKey.ts';
import LegacyPropertyValue from '../graph/LegacyPropertyValue.ts';
import VisibleEdgePropertyRecord from '../graph/VisibleEdgePropertyRecord.ts';
import WarpError from '../errors/WarpError.ts';
import {
  EDGE_PROP_PREFIX,
  FIELD_SEPARATOR,
  encodeEdgeKey,
} from './KeyCodec.ts';
import {
  isLegacyEdgePropertyProjectionTarget,
  type LegacyEdgePropertyProjectionTarget,
} from './LegacyPropertyProjectionTarget.ts';
import WarpState from './state/WarpState.ts';
import { compareEventIds, type EventId } from '../utils/EventId.ts';
import type { LWWRegister } from '../crdt/LWW.ts';
import type { PropValue } from '../types/PropValue.ts';

export type EdgePropertyProjectionEdge = LegacyEdgePropertyProjectionTarget;

type EdgePropertyKeyParts = EdgePropertyProjectionEdge & {
  readonly propKey: string;
};

type EdgePropertyKeySegmentValues = {
  readonly from: string | undefined;
  readonly to: string | undefined;
  readonly label: string | undefined;
  readonly propKey: string | undefined;
};

type EdgeOwnerRegisterProjection = {
  readonly state: WarpState;
  readonly owner: EdgeRecord;
  readonly encodedKey: string;
  readonly register: LWWRegister<PropValue>;
};

/** Projects visible legacy edge properties into compatibility records. */
export default class EdgePropertyProjection {
  /** Returns all visible edge property records in deterministic order. */
  static fromState(state: WarpState): readonly VisibleEdgePropertyRecord[] {
    const checkedState = requireWarpState(state);
    const records: VisibleEdgePropertyRecord[] = [];
    for (const [encodedKey, register] of checkedState.prop) {
      const record = edgePropertyRecordForRegister(checkedState, encodedKey, register);
      if (record !== null) {
        records.push(record);
      }
    }
    records.sort(compareEdgePropertyRecords);
    return Object.freeze(records);
  }

  /** Returns visible property records for one edge in deterministic order. */
  static forEdge(
    state: WarpState,
    edge: EdgePropertyProjectionEdge,
  ): readonly VisibleEdgePropertyRecord[] {
    const checkedState = requireWarpState(state);
    const owner = edgeRecordForProjectionTarget(checkedState, edge);
    if (owner === null) {
      return Object.freeze([]);
    }
    return EdgePropertyProjection.forEdgeRecord(checkedState, owner);
  }

  /** Returns visible property records for one runtime-backed edge owner. */
  static forEdgeRecord(
    state: WarpState,
    owner: EdgeRecord,
  ): readonly VisibleEdgePropertyRecord[] {
    const checkedState = requireWarpState(state);
    const checkedOwner = requireEdgeRecord(owner);
    const records: VisibleEdgePropertyRecord[] = [];
    for (const [encodedKey, register] of checkedState.prop) {
      const record = edgePropertyRecordForOwnerRegister({
        state: checkedState,
        owner: checkedOwner,
        encodedKey,
        register,
      });
      if (record !== null) {
        records.push(record);
      }
    }
    records.sort(compareEdgePropertyRecords);
    return Object.freeze(records);
  }
}

/** Requires a runtime-backed WarpState source. */
function requireWarpState(state: WarpState): WarpState {
  if (!(state instanceof WarpState)) {
    throw new WarpError('EdgePropertyProjection source must be a WarpState', 'E_VALIDATION');
  }
  return state;
}

/** Requires a runtime-backed edge record owner. */
function requireEdgeRecord(owner: EdgeRecord): EdgeRecord {
  if (!(owner instanceof EdgeRecord)) {
    throw new WarpError('EdgePropertyProjection owner must be an EdgeRecord', 'E_VALIDATION');
  }
  return owner;
}

/** Resolves a projection target without throwing on public miss carriers. */
function edgeRecordForProjectionTarget(
  state: WarpState,
  edge: EdgePropertyProjectionEdge,
): EdgeRecord | null {
  if (!isLegacyEdgePropertyProjectionTarget(edge)) {
    return null;
  }
  return state.getEdgeRecord(EdgeRecord.fromLegacyEdge(edge).id);
}

/** Builds an edge property record from one legacy state register. */
function edgePropertyRecordForRegister(
  state: WarpState,
  encodedKey: string,
  register: LWWRegister<PropValue>,
): VisibleEdgePropertyRecord | null {
  const keyParts = decodeVisibleEdgePropertyKey(encodedKey);
  if (keyParts === null) {
    return null;
  }
  const edgeKey = encodeEdgeKey(keyParts.from, keyParts.to, keyParts.label);
  const visibleRegister = visibleEdgeRegister(register, state.edgeBirthEvent.get(edgeKey));
  if (visibleRegister === null) {
    return null;
  }
  const owner = state.getEdgeRecord(EdgeRecord.fromLegacyEdge(keyParts).id);
  if (owner === null) {
    return null;
  }
  return new VisibleEdgePropertyRecord({
    owner,
    key: new LegacyEdgePropertyKey(keyParts.propKey),
    value: new LegacyPropertyValue(visibleRegister.value),
  });
}

/** Builds an edge property record when it belongs to the requested owner. */
function edgePropertyRecordForOwnerRegister(
  projection: EdgeOwnerRegisterProjection,
): VisibleEdgePropertyRecord | null {
  const keyParts = decodeVisibleEdgePropertyKey(projection.encodedKey);
  if (keyParts === null || !edgePropertyKeyPartsMatchOwner(keyParts, projection.owner)) {
    return null;
  }
  const edgeKey = encodeEdgeKey(keyParts.from, keyParts.to, keyParts.label);
  const visibleRegister = visibleEdgeRegister(
    projection.register,
    projection.state.edgeBirthEvent.get(edgeKey),
  );
  if (visibleRegister === null) {
    return null;
  }
  return new VisibleEdgePropertyRecord({
    owner: projection.owner,
    key: new LegacyEdgePropertyKey(keyParts.propKey),
    value: new LegacyPropertyValue(visibleRegister.value),
  });
}

/** Returns true when decoded edge-property key parts belong to an owner record. */
function edgePropertyKeyPartsMatchOwner(
  keyParts: EdgePropertyKeyParts,
  owner: EdgeRecord,
): boolean {
  return keyParts.from === owner.from.toString()
    && keyParts.to === owner.to.toString()
    && keyParts.label === owner.typeId.toString();
}

/** Decodes only well-formed legacy edge property keys. */
function decodeVisibleEdgePropertyKey(encodedKey: string): EdgePropertyKeyParts | null {
  if (!encodedKey.startsWith(EDGE_PROP_PREFIX)) {
    return null;
  }
  const parts = encodedKey.slice(1).split(FIELD_SEPARATOR);
  return edgePropertyKeyPartsFromSegments(parts);
}

/** Returns edge property parts only when the legacy segments are well-formed. */
function edgePropertyKeyPartsFromSegments(parts: readonly string[]): EdgePropertyKeyParts | null {
  if (parts.length !== 4) {
    return null;
  }
  return edgePropertyKeyPartsFromValues({
    from: parts[0],
    to: parts[1],
    label: parts[2],
    propKey: parts[3],
  });
}

/** Returns edge property parts when all decoded values are non-empty. */
function edgePropertyKeyPartsFromValues(
  values: EdgePropertyKeySegmentValues,
): EdgePropertyKeyParts | null {
  if (!isNonEmptyString(values.from)) {
    return null;
  }
  if (!isNonEmptyString(values.to)) {
    return null;
  }
  if (!isNonEmptyString(values.label)) {
    return null;
  }
  if (!isNonEmptyString(values.propKey)) {
    return null;
  }
  return {
    from: values.from,
    to: values.to,
    label: values.label,
    propKey: values.propKey,
  };
}

/** Returns true for decoded non-empty string segments. */
function isNonEmptyString(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

/** Filters edge registers hidden by edge rebirth. */
function visibleEdgeRegister(
  register: LWWRegister<PropValue>,
  birthEvent: EventId | undefined,
): LWWRegister<PropValue> | null {
  if (birthEvent === undefined || register.eventId === null) {
    return register;
  }
  if (compareEventIds(register.eventId, birthEvent) < 0) {
    return null;
  }
  return register;
}

/** Compares edge property records by owner and key. */
function compareEdgePropertyRecords(
  left: VisibleEdgePropertyRecord,
  right: VisibleEdgePropertyRecord,
): number {
  return compareStrings(edgePropertyRecordSortKey(left), edgePropertyRecordSortKey(right));
}

/** Returns the deterministic sort key for an edge property record. */
function edgePropertyRecordSortKey(record: VisibleEdgePropertyRecord): string {
  return `${record.owner.id.toString()}:${record.key.toString()}`;
}

/** Compares protocol strings without locale-sensitive collation. */
function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
