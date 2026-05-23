import AttachmentKey from './AttachmentKey.ts';
import AttachmentSchemaVersion from './AttachmentSchemaVersion.ts';
import EdgeRecord from './EdgeRecord.ts';
import NodeRecord from './NodeRecord.ts';
import WarpError from '../errors/WarpError.ts';
import { isPropValue, type PropValue } from '../types/PropValue.ts';

export type AttachmentOwnerRecord = NodeRecord | EdgeRecord;

export type AttachmentRecordFields = {
  readonly owner: AttachmentOwnerRecord;
  readonly key: AttachmentKey;
  readonly value: PropValue;
  readonly schemaVersion: AttachmentSchemaVersion;
};

/** Runtime-backed graph attachment slot and payload record. */
export default class AttachmentRecord {
  readonly owner: AttachmentOwnerRecord;
  readonly key: AttachmentKey;
  readonly value: PropValue;
  readonly schemaVersion: AttachmentSchemaVersion;

  constructor(fields: AttachmentRecordFields) {
    const checkedFields = requireFields(fields);
    this.owner = requireOwner(checkedFields.owner);
    this.key = requireKey(checkedFields.key);
    this.value = requireValue(checkedFields.value);
    this.schemaVersion = requireSchemaVersion(checkedFields.schemaVersion);
    Object.freeze(this);
  }

  /** Returns true when this attachment is owned by a node record. */
  isNodeAttachment(): boolean {
    return this.owner instanceof NodeRecord;
  }

  /** Returns true when this attachment is owned by an edge record. */
  isEdgeAttachment(): boolean {
    return this.owner instanceof EdgeRecord;
  }
}

/** Validates the attachment-record constructor envelope. */
function requireFields(fields: AttachmentRecordFields | null | undefined): AttachmentRecordFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('AttachmentRecord fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a runtime-backed attachment owner. */
function requireOwner(value: AttachmentOwnerRecord): AttachmentOwnerRecord {
  if (value instanceof NodeRecord || value instanceof EdgeRecord) {
    return value;
  }
  throw new WarpError('AttachmentRecord owner must be a NodeRecord or EdgeRecord', 'E_VALIDATION');
}

/** Requires a runtime-backed attachment key. */
function requireKey(value: AttachmentKey): AttachmentKey {
  if (!(value instanceof AttachmentKey)) {
    throw new WarpError('AttachmentRecord key must be an AttachmentKey', 'E_VALIDATION');
  }
  return value;
}

/** Requires a property-compatible attachment value. */
function requireValue(value: PropValue): PropValue {
  if (!isPropValue(value)) {
    throw new WarpError('AttachmentRecord value must be a PropValue', 'E_VALIDATION');
  }
  return value;
}

/** Requires a runtime-backed attachment schema version. */
function requireSchemaVersion(value: AttachmentSchemaVersion): AttachmentSchemaVersion {
  if (!(value instanceof AttachmentSchemaVersion)) {
    throw new WarpError(
      'AttachmentRecord schemaVersion must be an AttachmentSchemaVersion',
      'E_VALIDATION',
    );
  }
  return value;
}
