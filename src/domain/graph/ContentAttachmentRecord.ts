import ContentAttachmentPayload from './ContentAttachmentPayload.ts';
import EdgeRecord from './EdgeRecord.ts';
import NodeRecord from './NodeRecord.ts';
import WarpError from '../errors/WarpError.ts';
import type { AttachmentOwnerRecord } from './AttachmentRecord.ts';

export type ContentAttachmentRecordFields = {
  readonly owner: AttachmentOwnerRecord;
  readonly payload: ContentAttachmentPayload;
};

/** Runtime-backed content attachment bound to a node or edge owner. */
export default class ContentAttachmentRecord {
  readonly owner: AttachmentOwnerRecord;
  readonly payload: ContentAttachmentPayload;

  constructor(fields: ContentAttachmentRecordFields) {
    const checkedFields = requireFields(fields);
    this.owner = requireOwner(checkedFields.owner);
    this.payload = requirePayload(checkedFields.payload);
    Object.freeze(this);
  }

  /** Returns true when this content is owned by a node record. */
  isNodeContent(): boolean {
    return this.owner instanceof NodeRecord;
  }

  /** Returns true when this content is owned by an edge record. */
  isEdgeContent(): boolean {
    return this.owner instanceof EdgeRecord;
  }
}

/** Validates the content attachment record constructor envelope. */
function requireFields(
  fields: ContentAttachmentRecordFields | null | undefined,
): ContentAttachmentRecordFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('ContentAttachmentRecord fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a runtime-backed content owner. */
function requireOwner(value: AttachmentOwnerRecord): AttachmentOwnerRecord {
  if (value instanceof NodeRecord || value instanceof EdgeRecord) {
    return value;
  }
  throw new WarpError('ContentAttachmentRecord owner must be a NodeRecord or EdgeRecord', 'E_VALIDATION');
}

/** Requires a runtime-backed content payload. */
function requirePayload(value: ContentAttachmentPayload): ContentAttachmentPayload {
  if (!(value instanceof ContentAttachmentPayload)) {
    throw new WarpError('ContentAttachmentRecord payload must be a ContentAttachmentPayload', 'E_VALIDATION');
  }
  return value;
}
