import ContentAttachmentMime from '../graph/ContentAttachmentMime.ts';
import ContentAttachmentOid from '../graph/ContentAttachmentOid.ts';
import ContentAttachmentPayload from '../graph/ContentAttachmentPayload.ts';
import ContentAttachmentRecord from '../graph/ContentAttachmentRecord.ts';
import ContentAttachmentSize from '../graph/ContentAttachmentSize.ts';
import NodeRecord from '../graph/NodeRecord.ts';
import WarpError from '../errors/WarpError.ts';
import {
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
  encodeEdgeKey,
  encodeEdgePropKey,
  encodePropKey,
} from './KeyCodec.ts';
import { compareEventIds, type EventId } from '../utils/EventId.ts';
import WarpState from './state/WarpState.ts';
import type { LWWRegister } from '../crdt/LWW.ts';
import type EdgeRecord from '../graph/EdgeRecord.ts';
import type { PropValue } from '../types/PropValue.ts';

type Register = LWWRegister<PropValue>;
type ContentRegister = Register & { readonly value: string };

type ContentRegisters = {
  readonly content: ContentRegister;
  readonly mime: Register | null;
  readonly size: Register | null;
};

/** Projects legacy content properties into typed content attachment records. */
export default class ContentAttachmentProjection {
  /** Returns visible content attachments ordered by deterministic owner id. */
  static fromState(state: WarpState): readonly ContentAttachmentRecord[] {
    const checkedState = requireWarpState(state);
    const records: ContentAttachmentRecord[] = [];
    for (const owner of checkedState.nodeRecords()) {
      const record = contentRecordForNode(checkedState, owner);
      if (record !== null) {
        records.push(record);
      }
    }
    for (const owner of checkedState.edgeRecords()) {
      const record = contentRecordForEdge(checkedState, owner);
      if (record !== null) {
        records.push(record);
      }
    }
    records.sort(compareContentAttachmentRecords);
    return Object.freeze(records);
  }
}

/** Requires a runtime-backed WarpState projection source. */
function requireWarpState(state: WarpState): WarpState {
  if (!(state instanceof WarpState)) {
    throw new WarpError('ContentAttachmentProjection source must be a WarpState', 'E_VALIDATION');
  }
  return state;
}

/** Builds a typed content attachment record for a visible node owner. */
function contentRecordForNode(state: WarpState, owner: NodeRecord): ContentAttachmentRecord | null {
  const nodeId = owner.id.toString();
  const content = state.prop.get(encodePropKey(nodeId, CONTENT_PROPERTY_KEY));
  if (!isStringContentRegister(content)) {
    return null;
  }
  return contentRecordFromRegisters(owner, {
    content,
    mime: state.prop.get(encodePropKey(nodeId, CONTENT_MIME_PROPERTY_KEY)) ?? null,
    size: state.prop.get(encodePropKey(nodeId, CONTENT_SIZE_PROPERTY_KEY)) ?? null,
  });
}

/** Builds a typed content attachment record for a visible edge owner. */
function contentRecordForEdge(state: WarpState, owner: EdgeRecord): ContentAttachmentRecord | null {
  const from = owner.from.toString();
  const to = owner.to.toString();
  const label = owner.typeId.toString();
  const edgeKey = encodeEdgeKey(from, to, label);
  const birthEvent = state.edgeBirthEvent.get(edgeKey);
  const content = visibleEdgeRegister(
    state.prop.get(encodeEdgePropKey(from, to, label, CONTENT_PROPERTY_KEY)),
    birthEvent,
  );
  if (!isStringContentRegister(content)) {
    return null;
  }
  return contentRecordFromRegisters(owner, {
    content,
    mime: visibleEdgeRegister(
      state.prop.get(encodeEdgePropKey(from, to, label, CONTENT_MIME_PROPERTY_KEY)),
      birthEvent,
    ),
    size: visibleEdgeRegister(
      state.prop.get(encodeEdgePropKey(from, to, label, CONTENT_SIZE_PROPERTY_KEY)),
      birthEvent,
    ),
  });
}

/** Returns a typed content record from visible legacy registers. */
function contentRecordFromRegisters(
  owner: NodeRecord | EdgeRecord,
  registers: ContentRegisters,
): ContentAttachmentRecord {
  return new ContentAttachmentRecord({
    owner,
    payload: new ContentAttachmentPayload({
      oid: new ContentAttachmentOid(registers.content.value),
      mime: contentMimeFromRegister(registers.content, registers.mime),
      size: contentSizeFromRegister(registers.content, registers.size),
    }),
  });
}

/** Returns true when a register can supply a content storage reference. */
function isStringContentRegister(register: Register | null | undefined): register is ContentRegister {
  return register !== null && register !== undefined && typeof register.value === 'string';
}

/** Filters edge registers hidden by edge rebirth. */
function visibleEdgeRegister(
  register: Register | undefined,
  birthEvent: EventId | undefined,
): Register | null {
  if (register === undefined) {
    return null;
  }
  if (birthEvent !== undefined && register.eventId !== null && compareEventIds(register.eventId, birthEvent) < 0) {
    return null;
  }
  return register;
}

/** Returns true when metadata belongs to the same content write lineage. */
function isSameLineage(left: EventId | null | undefined, right: EventId | null | undefined): boolean {
  if (left === null || left === undefined || right === null || right === undefined) {
    return false;
  }
  return compareEventIds(left, right) === 0;
}

/** Projects a MIME register into optional typed metadata. */
function contentMimeFromRegister(content: Register, mime: Register | null): ContentAttachmentMime | null {
  if (mime === null || !isSameLineage(content.eventId, mime.eventId)) {
    return null;
  }
  return contentMimeFromValue(mime.value);
}

/** Projects a raw MIME value into optional typed metadata. */
function contentMimeFromValue(value: PropValue): ContentAttachmentMime | null {
  if (!isProjectableMimeValue(value)) {
    return null;
  }
  return new ContentAttachmentMime(value);
}

/** Projects a size register into optional typed metadata. */
function contentSizeFromRegister(content: Register, size: Register | null): ContentAttachmentSize | null {
  if (size === null || !isSameLineage(content.eventId, size.eventId)) {
    return null;
  }
  return contentSizeFromValue(size.value);
}

/** Projects a raw size value into optional typed metadata. */
function contentSizeFromValue(value: PropValue): ContentAttachmentSize | null {
  if (!isProjectableSizeValue(value)) {
    return null;
  }
  return new ContentAttachmentSize(value);
}

/** Returns true when a value can become attachment MIME metadata. */
function isProjectableMimeValue(value: PropValue): value is string {
  return typeof value === 'string' && value.length > 0 && !value.includes('\0');
}

/** Returns true when a value can become attachment size metadata. */
function isProjectableSizeValue(value: PropValue): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Compares content attachment records by deterministic owner order. */
function compareContentAttachmentRecords(
  left: ContentAttachmentRecord,
  right: ContentAttachmentRecord,
): number {
  return compareStrings(contentAttachmentSortKey(left), contentAttachmentSortKey(right));
}

/** Returns the deterministic sort key for a content attachment record. */
function contentAttachmentSortKey(record: ContentAttachmentRecord): string {
  if (record.owner instanceof NodeRecord) {
    return `node:${record.owner.id.toString()}`;
  }
  return `edge:${record.owner.id.toString()}`;
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
