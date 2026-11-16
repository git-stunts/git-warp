/**
 * Per-lifecycle trace reserve. Basis: the 2026-11-11 Docker runs measured at
 * most 196 Git processes per write (a 200-thread bulk write) and about 4.1 KiB
 * allocated per trace file. The largest Warp lifecycle is the 2,000-thread
 * scale: 124 bulk writes plus 60 saves. The reserve doubles both measurements.
 */
const MEASURED_PROCESSES_PER_WRITE = 196;
const LARGEST_LIFECYCLE_WRITES = 124 + 60;
const RESERVE_MARGIN = 2;
const TRACE_FILE_BYTES = 8 * 1024;

/** 184 * 196 * 2 = 72,128 files, rounded up to 72,704 (71 Ki): 2.02 times 36,064, with room for setup and close. */
export const TRACE_FILE_LIMIT = Math.ceil(
  (LARGEST_LIFECYCLE_WRITES * MEASURED_PROCESSES_PER_WRITE * RESERVE_MARGIN) / 1024,
) * 1024;
/** 72,704 files at 8 KiB each: 568 MiB of logical or allocated trace bytes. */
export const TRACE_BYTE_LIMIT = TRACE_FILE_LIMIT * TRACE_FILE_BYTES;

/** Per-lifecycle trace accounting limits, at or below the production reserve. */
export default class GitTraceReserve {
  readonly bytes: number;
  readonly files: number;

  constructor(limits: { readonly bytes: number; readonly files: number }) {
    const { bytes, files } = limits;
    if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > TRACE_BYTE_LIMIT) {
      throw new RangeError('Git trace byte reserve must be a positive safe integer at or below its production maximum');
    }
    if (!Number.isSafeInteger(files) || files < 1 || files > TRACE_FILE_LIMIT) {
      throw new RangeError('Git trace file reserve must be a positive safe integer at or below its production maximum');
    }
    this.bytes = bytes;
    this.files = files;
    Object.freeze(this);
  }

  static production(): GitTraceReserve {
    return new GitTraceReserve({ bytes: TRACE_BYTE_LIMIT, files: TRACE_FILE_LIMIT });
  }
}
