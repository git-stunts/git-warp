import WarpError from '../errors/WarpError.ts';
import ContentAttachmentMime from '../graph/ContentAttachmentMime.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';

type StagedContentFields = Readonly<{
  readonly id: string;
  readonly mime: string | null;
  readonly size: number;
}>;

/** Immutable staged-byte identity; publication additionally requires its Runtime binding. */
export default class StagedContent {
  readonly id: string;
  readonly mime: string | null;
  readonly size: number;

  constructor(fields: StagedContentFields | null | undefined) {
    if (fields === null || fields === undefined) {
      throw new WarpError('Staged content metadata is required', 'E_CONTENT_METADATA');
    }
    const { id, mime, size } = fields;
    requireNonEmptyString(id, 'content.id');
    requirePlaintextSize(size);
    this.id = id;
    this.mime = mime === null ? null : new ContentAttachmentMime(mime).toString();
    this.size = size;
    Object.freeze(this);
  }
}

function requirePlaintextSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new WarpError('Staged content requires a non-negative safe byte count', 'E_CONTENT_SIZE');
  }
}
