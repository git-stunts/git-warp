import ContentAttachmentMime from './ContentAttachmentMime.ts';
import ContentAttachmentHandle from './ContentAttachmentHandle.ts';
import ContentAttachmentSize from './ContentAttachmentSize.ts';
import WarpError from '../errors/WarpError.ts';

export type ContentAttachmentPayloadFields = {
  readonly handle: ContentAttachmentHandle;
  readonly mime: ContentAttachmentMime | null;
  readonly size: ContentAttachmentSize | null;
};

/** Runtime-backed content attachment payload metadata. */
export default class ContentAttachmentPayload {
  readonly handle: ContentAttachmentHandle;
  readonly mime: ContentAttachmentMime | null;
  readonly size: ContentAttachmentSize | null;

  constructor(fields: ContentAttachmentPayloadFields) {
    const checkedFields = requireFields(fields);
    this.handle = requireHandle(checkedFields.handle);
    this.mime = requireMime(checkedFields.mime);
    this.size = requireSize(checkedFields.size);
    Object.freeze(this);
  }

  /** Returns true when a MIME hint is present. */
  hasMime(): boolean {
    return this.mime instanceof ContentAttachmentMime;
  }

  /** Returns true when a byte length is present. */
  hasSize(): boolean {
    return this.size instanceof ContentAttachmentSize;
  }
}

/** Validates the content payload constructor envelope. */
function requireFields(
  fields: ContentAttachmentPayloadFields | null | undefined,
): ContentAttachmentPayloadFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('ContentAttachmentPayload fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a runtime-backed content storage reference. */
function requireHandle(value: ContentAttachmentHandle): ContentAttachmentHandle {
  if (!(value instanceof ContentAttachmentHandle)) {
    throw new WarpError(
      'ContentAttachmentPayload handle must be a ContentAttachmentHandle',
      'E_VALIDATION',
    );
  }
  return value;
}

/** Requires absent metadata or a runtime-backed MIME hint. */
function requireMime(value: ContentAttachmentMime | null): ContentAttachmentMime | null {
  if (value === null || value instanceof ContentAttachmentMime) {
    return value;
  }
  throw new WarpError('ContentAttachmentPayload mime must be null or a ContentAttachmentMime', 'E_VALIDATION');
}

/** Requires absent metadata or a runtime-backed byte length. */
function requireSize(value: ContentAttachmentSize | null): ContentAttachmentSize | null {
  if (value === null || value instanceof ContentAttachmentSize) {
    return value;
  }
  throw new WarpError('ContentAttachmentPayload size must be null or a ContentAttachmentSize', 'E_VALIDATION');
}
