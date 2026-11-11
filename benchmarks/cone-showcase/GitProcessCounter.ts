import { closeSync, fstatSync, lstatSync, openSync, readdirSync, readSync, unlinkSync, type Stats } from 'node:fs';
import { join } from 'node:path';

import GitProcessCount from './GitProcessCount.ts';

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

/**
 * Counts unique Git Trace2 files, including configured Git descendants.
 * Long-lived sessions count only where their file first appears.
 * The caller retains samples before cleanup, and closes all writers first.
 */
export default class GitProcessCounter {
  readonly #directory: string;
  readonly #seen = new Map<string, string>();

  constructor(directory: string) {
    if (directory.length === 0) {
      throw new TypeError('a Git trace counter needs its owned directory');
    }
    this.#directory = directory;
  }

  capture(): GitProcessCount {
    const files = this.#inspect();
    const fresh = [...files.keys()].filter((file) => !this.#seen.has(file));
    for (const [file, identity] of files) {
      this.#seen.set(file, identity);
    }
    return new GitProcessCount(fresh);
  }

  /** Only after all owning Warp/Runtime handles or the cold child have closed. */
  cleanupAfterWritersClosed(): void {
    const files = this.#inspect();
    if ([...files.keys()].some((file) => !this.#seen.has(file))) {
      throw new TypeError('Git trace cleanup refused unretained process identities');
    }
    for (const file of files.keys()) {
      unlinkSync(join(this.#directory, file));
    }
    this.#seen.clear();
  }

  #inspect(): ReadonlyMap<string, string> {
    if (!lstatSync(this.#directory).isDirectory()) {
      throw new TypeError('Git trace directory is missing or not a real directory');
    }
    const entries = readdirSync(this.#directory, { withFileTypes: true });
    if (entries.length > TRACE_FILE_LIMIT) {
      throw new RangeError('Git trace file reserve exhausted; sample is incomplete');
    }
    const files = new Map<string, string>();
    let allocated = 0;
    for (const entry of entries) {
      if (entry.name === 'git-trace2-discard' || !entry.isFile()) {
        throw new TypeError('Git trace contains a discarded or nonregular result');
      }
      const info = this.#inspectFile(join(this.#directory, entry.name), allocated);
      allocated += Math.max(info.size, info.blocks * 512);
      files.set(entry.name, `${String(info.dev)}:${String(info.ino)}`);
    }
    if ([...this.#seen].some(([file, identity]) => files.get(file) !== identity)) {
      throw new TypeError('a retained Git trace file disappeared or changed identity before lifecycle cleanup');
    }
    return files;
  }

  #inspectFile(path: string, allocatedBefore: number): Stats {
    const info = lstatSync(path);
    if (!info.isFile() || info.nlink !== 1 || info.size === 0) {
      throw new TypeError('Git trace file is nonregular, aliased, or incomplete');
    }
    let allocated = allocatedBefore + Math.max(info.size, info.blocks * 512);
    if (allocated > TRACE_BYTE_LIMIT) {
      throw new RangeError('Git trace byte reserve exhausted; sample is incomplete');
    }
    const file = openSync(path, 'r');
    try {
      const opened = fstatSync(file);
      if (opened.dev !== info.dev || opened.ino !== info.ino) {
        throw new TypeError('Git trace file identity changed during sampling');
      }
      allocated += Math.max(opened.size, opened.blocks * 512) - Math.max(info.size, info.blocks * 512);
      if (allocated > TRACE_BYTE_LIMIT || opened.size === 0) {
        throw new RangeError('Git trace grew beyond its reserve or became incomplete while sampling');
      }
      const end = new Uint8Array(1);
      if (readSync(file, end, 0, 1, opened.size - 1) !== 1 || end[0] !== 10) {
        throw new TypeError('Git trace output has an incomplete final record');
      }
      return opened;
    } finally {
      closeSync(file);
    }
  }
}
