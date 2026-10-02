import WarpError from '../errors/WarpError.ts';
import ContentAttachmentMime from '../graph/ContentAttachmentMime.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import ContentOwner, { type ContentOwnerDescriptor } from './ContentOwner.ts';
import { registerReadingDomainObject } from './ReadingValueRuntime.ts';

type ContentAttachmentFields = Readonly<{
  id: string;
  mime: string | null;
  size: number | null;
  owner: ContentOwnerDescriptor;
  open: () => AsyncIterable<Uint8Array>;
}>;

/** One captured attachment identity and its stream-opening capability. No payload bytes are retained. */
export default class ContentAttachment {
  readonly id: string;
  readonly mime: string | null;
  readonly size: number | null;
  readonly owner: ContentOwnerDescriptor;
  readonly #open: () => AsyncIterable<Uint8Array>;

  constructor(fields: ContentAttachmentFields | null | undefined) {
    if (fields === null || fields === undefined) {
      throw new WarpError('Content attachment fields are required', 'E_CONTENT_FIELDS');
    }
    const { id, mime, size, owner, open } = fields;
    requireNonEmptyString(id, 'content.id');
    if (typeof open !== 'function') {
      throw new WarpError('Content attachment requires a stream opener', 'E_CONTENT_STREAM');
    }
    this.id = id;
    this.mime = mime === null ? null : new ContentAttachmentMime(mime).toString();
    this.size = requireSize(size);
    this.owner = new ContentOwner(owner).descriptor;
    this.#open = open;
    Object.freeze(this);
    registerReadingDomainObject(this);
  }

  /** Opens the captured bytes, even when the current owner has since changed. */
  open(): AsyncIterable<Uint8Array> { return this.#open(); }
}

function requireSize(size: number | null): number | null {
  if (size !== null && (!Number.isSafeInteger(size) || size < 0)) {
    throw new WarpError('Content size must be a non-negative safe byte count or absent', 'E_CONTENT_SIZE');
  }
  return size;
}
