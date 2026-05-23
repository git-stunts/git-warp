import AttachmentRecord from './AttachmentRecord.ts';
import WarpError from '../errors/WarpError.ts';

export const GRAPH_ATTACHMENT_SET_OP = 'GraphAttachmentSet';

export type GraphAttachmentSetOpFields = {
  readonly record: AttachmentRecord;
};

/** Runtime-backed graph operation that sets an attachment payload. */
export default class GraphAttachmentSetOp {
  readonly type = GRAPH_ATTACHMENT_SET_OP;
  readonly record: AttachmentRecord;

  constructor(fields: GraphAttachmentSetOpFields) {
    const checkedFields = requireFields(fields);
    this.record = requireAttachmentRecord(checkedFields.record);
    Object.freeze(this);
  }
}

/** Validates the graph-attachment operation constructor envelope. */
function requireFields(
  fields: GraphAttachmentSetOpFields | null | undefined,
): GraphAttachmentSetOpFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphAttachmentSetOp fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a runtime-backed attachment record. */
function requireAttachmentRecord(record: AttachmentRecord): AttachmentRecord {
  if (!(record instanceof AttachmentRecord)) {
    throw new WarpError('GraphAttachmentSetOp record must be an AttachmentRecord', 'E_VALIDATION');
  }
  return record;
}
