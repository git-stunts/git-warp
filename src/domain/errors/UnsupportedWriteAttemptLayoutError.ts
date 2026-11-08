import WarpError from './WarpError.ts';

/** The layout before #1072, which only clones of unreleased `main` wrote. */
const RETIRED_LAYOUT = 1;

/**
 * A write attempt record whose layout version this build does not read. Layout 1 came
 * only from clones of unreleased `main`: its ref holds only that attempt's recovery record,
 * not graph data, so deleting that one ref is safe. A newer layout came from a newer
 * git-warp, which is the build that can finish it. No release ever wrote any other older
 * layout, such as 0, so such a record is corrupt: keep it and report it. `writer` is null
 * when the record no longer names a writer this build can read.
 */
export default class UnsupportedWriteAttemptLayoutError extends WarpError {
  readonly ref: string;
  readonly version: number;
  readonly writer: string | null;

  constructor(fields: { readonly ref: string; readonly version: number; readonly writer: string | null; readonly readable: number }) {
    super(messageOf(fields), 'E_WRITE_ATTEMPT_LAYOUT_UNSUPPORTED');
    this.ref = fields.ref;
    this.version = fields.version;
    this.writer = fields.writer;
  }
}

function messageOf({ ref, version, readable }: { readonly ref: string; readonly version: number; readonly readable: number }): string {
  const unread = `The write attempt record at ${ref} uses layout version ${String(version)}, which this git-warp does not read`;
  if (version === RETIRED_LAYOUT) {
    return `${unread}; it holds no graph data, so delete only that ref: git update-ref -d ${ref}`;
  }
  return version > readable
    ? `${unread}; a newer git-warp wrote it, so keep the ref and finish that attempt with that build`
    : `${unread}; no release writes that layout, so the record is corrupt: keep the ref and report it`;
}
