import ContentAttachmentRecord from './ContentAttachmentRecord.ts';
import WarpError from '../errors/WarpError.ts';

export const GRAPH_CONTENT_ATTACHMENT_SET_OP = 'GraphContentAttachmentSet';

export type GraphContentAttachmentSetOpFields = {
  readonly record: ContentAttachmentRecord;
};

/** Runtime-backed graph operation that records a typed content attachment. */
export default class GraphContentAttachmentSetOp {
  readonly type = GRAPH_CONTENT_ATTACHMENT_SET_OP;
  readonly record: ContentAttachmentRecord;

  constructor(fields: GraphContentAttachmentSetOpFields) {
    const checkedFields = requireFields(fields);
    this.record = requireContentAttachmentRecord(checkedFields.record);
    Object.freeze(this);
  }
}

/** Validates the graph-content operation constructor envelope. */
function requireFields(
  fields: GraphContentAttachmentSetOpFields | null | undefined,
): GraphContentAttachmentSetOpFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphContentAttachmentSetOp fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a runtime-backed content attachment record. */
function requireContentAttachmentRecord(record: ContentAttachmentRecord): ContentAttachmentRecord {
  if (!(record instanceof ContentAttachmentRecord)) {
    throw new WarpError(
      'GraphContentAttachmentSetOp record must be a ContentAttachmentRecord',
      'E_VALIDATION',
    );
  }
  return record;
}
