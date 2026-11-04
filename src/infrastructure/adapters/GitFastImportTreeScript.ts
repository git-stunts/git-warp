import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';
import { textEncode } from '../../domain/utils/bytes.ts';

/**
 * Fast-import needs a branch to build a tree on. The script resets it
 * without a starting point at the end, so fast-import never creates or
 * updates this ref; only the objects remain.
 */
const STAGING_BRANCH = 'refs/warp/cone-import/staging';
/** A fixed identity and time keep the throwaway commit deterministic. */
const COMMIT_HEADER = `commit ${STAGING_BRANCH}\ncommitter git-warp <> 0 +0000\ndata 0\n`;
const TRAILER = `ls ""\nreset ${STAGING_BRANCH}\ndone\n`;
const PATH_PATTERN = /^[0-9A-Za-z_-]+(?:\/[0-9A-Za-z_-]+)*$/u;
const OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

/**
 * A `git fast-import` program that builds one tree and reports its id.
 *
 * The tree starts empty; `graft` places an existing tree, `link` an existing
 * blob, `write` new blob content, and `remove` drops a path. Fast-import
 * writes every new blob and tree of the program in one process and one
 * pack, which Git explodes into loose objects when the pack is small (its
 * `fastimport.unpackLimit`, default 100 objects) and keeps otherwise. The
 * program ends with `ls ""`, whose single output line names the root tree.
 */
export default class GitFastImportTreeScript {
  readonly #chunks: Uint8Array[] = [textEncode(COMMIT_HEADER)];
  #operations = 0;

  /** Places the existing tree `treeOid` at `path`. */
  graft(path: string, treeOid: string): void {
    this.#command(`M 040000 ${objectId(treeOid)} ${treePath(path)}\n`);
  }

  /** Places the existing blob `blobOid` at `path`. */
  link(path: string, blobOid: string): void {
    this.#command(`M 100644 ${objectId(blobOid)} ${treePath(path)}\n`);
  }

  /** Writes `content` as a new blob at `path`. */
  write(path: string, content: Uint8Array): void {
    this.#command(`M 100644 inline ${treePath(path)}\ndata ${content.byteLength}\n`);
    this.#chunks.push(content, textEncode('\n'));
  }

  /** Removes `path` and everything below it. */
  remove(path: string): void {
    this.#command(`D ${treePath(path)}\n`);
  }

  /** Number of graft, link, write and remove operations so far. */
  get operations(): number {
    return this.#operations;
  }

  /** The complete fast-import input. */
  encode(): Uint8Array {
    const parts = [...this.#chunks, textEncode(TRAILER)];
    const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    return bytes;
  }

  #command(line: string): void {
    this.#chunks.push(textEncode(line));
    this.#operations += 1;
  }
}

function treePath(path: string): string {
  if (!PATH_PATTERN.test(path)) {
    throw new AdapterValidationError(`Fast-import tree path is not a plain relative path: ${JSON.stringify(path)}`);
  }
  return path;
}

function objectId(oid: string): string {
  if (!OBJECT_ID_PATTERN.test(oid)) {
    throw new AdapterValidationError(`Fast-import object id is not a full lowercase hex id: ${JSON.stringify(oid)}`);
  }
  return oid;
}
