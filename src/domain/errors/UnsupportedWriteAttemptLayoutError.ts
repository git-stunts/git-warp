import WarpError from './WarpError.ts';

/** The one layout this build reads and writes (#1072). */
const READABLE_LAYOUT = 2;

/**
 * A well-formed write attempt record in a layout this build does not read. An older
 * layout (1 and below) came only from clones of unreleased `main`: its ref holds only
 * that attempt's recovery record, not graph data, so deleting that one ref is safe. A
 * newer layout came from a newer git-warp, which is the build that can finish it.
 */
export default class UnsupportedWriteAttemptLayoutError extends WarpError {
  readonly ref: string;
  readonly version: number;
  readonly writer: string;

  constructor(fields: { readonly ref: string; readonly version: number; readonly writer: string }) {
    super(messageOf(fields.ref, fields.version), 'E_WRITE_ATTEMPT_LAYOUT_UNSUPPORTED');
    this.ref = fields.ref;
    this.version = fields.version;
    this.writer = fields.writer;
  }
}

function messageOf(ref: string, version: number): string {
  const unread = `The write attempt record at ${ref} uses layout version ${String(version)}, which this git-warp does not read`;
  return version < READABLE_LAYOUT
    ? `${unread}; it holds no graph data, so delete only that ref: git update-ref -d ${ref}`
    : `${unread}; a newer git-warp wrote it, so finish that attempt with that build`;
}
