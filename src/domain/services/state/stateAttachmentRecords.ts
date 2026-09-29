/**
 * Builds the visible attachment records a WarpState projects from its
 * legacy property registers.
 *
 * @module domain/services/state/stateAttachmentRecords
 */

import type { LWWRegister } from '../../crdt/LWW.ts';
import { compareEventIds, type EventId } from '../../utils/EventId.ts';
import { compareStrings } from '../../utils/StringComparison.ts';
import AttachmentKey from '../../graph/AttachmentKey.ts';
import AttachmentRecord from '../../graph/AttachmentRecord.ts';
import AttachmentSchemaVersion from '../../graph/AttachmentSchemaVersion.ts';
import EdgeRecord from '../../graph/EdgeRecord.ts';
import NodeRecord from '../../graph/NodeRecord.ts';
import { tryDecodeEdgePropKey, decodePropKey, encodeEdgeKey, isEdgePropKey } from '../KeyCodec.ts';
import type { PropValue } from '../../types/PropValue.ts';
import type WarpState from './WarpState.ts';

/** Builds a visible attachment record from a legacy property map entry. */
export function attachmentRecordForProperty(
  state: WarpState,
  propKey: string,
  register: LWWRegister<PropValue>,
): AttachmentRecord | null {
  if (isEdgePropKey(propKey)) {
    return edgeAttachmentRecordForProperty(state, propKey, register);
  }
  return nodeAttachmentRecordForProperty(state, propKey, register);
}

/** Builds a node-owned attachment record from a legacy node property. */
function nodeAttachmentRecordForProperty(
  state: WarpState,
  propKey: string,
  register: LWWRegister<PropValue>,
): AttachmentRecord | null {
  const decoded = decodePropKey(propKey);
  const owner = state.getNodeRecord(decoded.nodeId);
  if (owner === null) {
    return null;
  }
  return new AttachmentRecord({
    owner,
    key: new AttachmentKey(decoded.propKey),
    value: register.value,
    schemaVersion: AttachmentSchemaVersion.current(),
  });
}

/** Builds an edge-owned attachment record from a legacy edge property. */
function edgeAttachmentRecordForProperty(
  state: WarpState,
  propKey: string,
  register: LWWRegister<PropValue>,
): AttachmentRecord | null {
  const decoded = tryDecodeEdgePropKey(propKey);
  if (decoded === null) {
    return null;
  }
  const edgeKey = encodeEdgeKey(decoded.from, decoded.to, decoded.label);
  if (isStaleEdgeAttachment(register, state.edgeBirthEvent.get(edgeKey))) {
    return null;
  }
  if (!state.edgeAlive.contains(edgeKey)) {
    return null;
  }
  if (!endpointsVisible(state, decoded.from, decoded.to)) {
    return null;
  }
  const owner = EdgeRecord.fromLegacyEdge(decoded);
  return new AttachmentRecord({
    owner,
    key: new AttachmentKey(decoded.propKey),
    value: register.value,
    schemaVersion: AttachmentSchemaVersion.current(),
  });
}

/** Both endpoints must be visible before an edge-owned attachment can be read. */
function endpointsVisible(state: WarpState, from: string, to: string): boolean {
  return state.hasNodeRecord(from) && state.hasNodeRecord(to);
}

/** Returns true when an edge attachment predates the current edge birth. */
function isStaleEdgeAttachment(
  register: LWWRegister<PropValue>,
  birthEvent: EventId | undefined,
): boolean {
  if (birthEvent === undefined || register.eventId === null) {
    return false;
  }
  return compareEventIds(register.eventId, birthEvent) < 0;
}

/** Compares attachment records by deterministic owner/key order. */
export function compareAttachmentRecords(left: AttachmentRecord, right: AttachmentRecord): number {
  return compareStrings(attachmentRecordSortKey(left), attachmentRecordSortKey(right));
}

/** Returns the deterministic sort key for an attachment record. */
function attachmentRecordSortKey(record: AttachmentRecord): string {
  if (record.owner instanceof NodeRecord) {
    return `node:${record.owner.id.toString()}:${record.key.toString()}`;
  }
  return `edge:${record.owner.id.toString()}:${record.key.toString()}`;
}
