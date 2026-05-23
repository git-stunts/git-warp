import LegacyNodePropertyKey from '../graph/LegacyNodePropertyKey.ts';
import LegacyPropertyValue from '../graph/LegacyPropertyValue.ts';
import NodeRecord from '../graph/NodeRecord.ts';
import VisibleNodePropertyRecord from '../graph/VisibleNodePropertyRecord.ts';
import WarpError from '../errors/WarpError.ts';
import {
  EDGE_PROP_PREFIX,
  FIELD_SEPARATOR,
} from './KeyCodec.ts';
import { isLegacyNodePropertyProjectionTarget } from './LegacyPropertyProjectionTarget.ts';
import WarpState from './state/WarpState.ts';
import type { LWWRegister } from '../crdt/LWW.ts';
import type NodeId from '../graph/NodeId.ts';
import type { PropValue } from '../types/PropValue.ts';

type NodePropertyKeyParts = {
  readonly nodeId: string;
  readonly propKey: string;
};

/** Projects visible legacy node properties into compatibility records. */
export default class NodePropertyProjection {
  /** Returns all visible node property records in deterministic order. */
  static fromState(state: WarpState): readonly VisibleNodePropertyRecord[] {
    const checkedState = requireWarpState(state);
    const records: VisibleNodePropertyRecord[] = [];
    for (const [encodedKey, register] of checkedState.prop) {
      const record = nodePropertyRecordForRegister(checkedState, encodedKey, register);
      if (record !== null) {
        records.push(record);
      }
    }
    records.sort(compareNodePropertyRecords);
    return Object.freeze(records);
  }

  /** Returns visible property records for one node in deterministic order. */
  static forNode(state: WarpState, nodeId: string | NodeId): readonly VisibleNodePropertyRecord[] {
    const checkedState = requireWarpState(state);
    const owner = nodeRecordForProjectionTarget(checkedState, nodeId);
    if (owner === null) {
      return Object.freeze([]);
    }
    return NodePropertyProjection.forNodeRecord(checkedState, owner);
  }

  /** Returns visible property records for one runtime-backed node owner. */
  static forNodeRecord(
    state: WarpState,
    owner: NodeRecord,
  ): readonly VisibleNodePropertyRecord[] {
    const checkedState = requireWarpState(state);
    const checkedOwner = requireNodeRecord(owner);
    const records: VisibleNodePropertyRecord[] = [];
    for (const [encodedKey, register] of checkedState.prop) {
      const record = nodePropertyRecordForOwnerRegister(checkedOwner, encodedKey, register);
      if (record !== null) {
        records.push(record);
      }
    }
    records.sort(compareNodePropertyRecords);
    return Object.freeze(records);
  }
}

/** Requires a runtime-backed WarpState source. */
function requireWarpState(state: WarpState): WarpState {
  if (!(state instanceof WarpState)) {
    throw new WarpError('NodePropertyProjection source must be a WarpState', 'E_VALIDATION');
  }
  return state;
}

/** Requires a runtime-backed node record owner. */
function requireNodeRecord(owner: NodeRecord): NodeRecord {
  if (!(owner instanceof NodeRecord)) {
    throw new WarpError('NodePropertyProjection owner must be a NodeRecord', 'E_VALIDATION');
  }
  return owner;
}

/** Resolves a projection target without throwing on public miss carriers. */
function nodeRecordForProjectionTarget(state: WarpState, nodeId: string | NodeId): NodeRecord | null {
  if (typeof nodeId === 'string' && !isLegacyNodePropertyProjectionTarget(nodeId)) {
    return null;
  }
  return state.getNodeRecord(nodeId);
}

/** Builds a node property record from one legacy state register. */
function nodePropertyRecordForRegister(
  state: WarpState,
  encodedKey: string,
  register: LWWRegister<PropValue>,
): VisibleNodePropertyRecord | null {
  const keyParts = decodeVisibleNodePropertyKey(encodedKey);
  if (keyParts === null) {
    return null;
  }
  const owner = state.getNodeRecord(keyParts.nodeId);
  if (owner === null) {
    return null;
  }
  return new VisibleNodePropertyRecord({
    owner,
    key: new LegacyNodePropertyKey(keyParts.propKey),
    value: new LegacyPropertyValue(register.value),
  });
}

/** Builds a node property record when it belongs to the requested owner. */
function nodePropertyRecordForOwnerRegister(
  owner: NodeRecord,
  encodedKey: string,
  register: LWWRegister<PropValue>,
): VisibleNodePropertyRecord | null {
  const keyParts = decodeVisibleNodePropertyKey(encodedKey);
  if (keyParts === null || keyParts.nodeId !== owner.id.toString()) {
    return null;
  }
  return new VisibleNodePropertyRecord({
    owner,
    key: new LegacyNodePropertyKey(keyParts.propKey),
    value: new LegacyPropertyValue(register.value),
  });
}

/** Decodes only well-formed legacy node property keys. */
function decodeVisibleNodePropertyKey(encodedKey: string): NodePropertyKeyParts | null {
  if (encodedKey.startsWith(EDGE_PROP_PREFIX)) {
    return null;
  }
  const parts = encodedKey.split(FIELD_SEPARATOR);
  return nodePropertyKeyPartsFromSegments(parts);
}

/** Returns node property parts only when the legacy segments are well-formed. */
function nodePropertyKeyPartsFromSegments(parts: readonly string[]): NodePropertyKeyParts | null {
  if (parts.length !== 2) {
    return null;
  }
  return nodePropertyKeyPartsFromValues(parts[0], parts[1]);
}

/** Returns node property parts when both decoded values are non-empty. */
function nodePropertyKeyPartsFromValues(
  nodeId: string | undefined,
  propKey: string | undefined,
): NodePropertyKeyParts | null {
  if (!isNonEmptyString(nodeId)) {
    return null;
  }
  if (!isNonEmptyString(propKey)) {
    return null;
  }
  return { nodeId, propKey };
}

/** Returns true for decoded non-empty string segments. */
function isNonEmptyString(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

/** Compares node property records by owner and key. */
function compareNodePropertyRecords(
  left: VisibleNodePropertyRecord,
  right: VisibleNodePropertyRecord,
): number {
  return compareStrings(nodePropertyRecordSortKey(left), nodePropertyRecordSortKey(right));
}

/** Returns the deterministic sort key for a node property record. */
function nodePropertyRecordSortKey(record: VisibleNodePropertyRecord): string {
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
