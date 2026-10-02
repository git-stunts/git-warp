/**
 * Git-compatible hashing helpers for the in-memory persistence adapter.
 *
 * Computes Git-format SHA-1 hashes for blobs, trees, and commits so that
 * content addresses are deterministic and debuggable against real Git.
 */
import { concatBytes, hexDecode, textEncode } from '../../src/domain/utils/bytes.ts';
import PersistenceError from '../../src/domain/errors/PersistenceError.ts';
import WarpError from '../../src/domain/errors/WarpError.ts';

// ---------------------------------------------------------------------------
// Input coercion
// ---------------------------------------------------------------------------

/** Converts string or Uint8Array to bytes. */
export function toBytes(data: string | Uint8Array): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (typeof data === 'string') {
    return textEncode(data);
  }
  throw new WarpError('Expected string or Uint8Array', 'E_INVALID_INPUT');
}

// ---------------------------------------------------------------------------
// Instance-owned hash capability preparation
// ---------------------------------------------------------------------------

export type HashFn = (data: Uint8Array) => string;

/** Capture hashing for one adapter; no process-wide probe state is retained. */
export async function prepareHash(hash: HashFn | undefined): Promise<HashFn | null> {
  if (hash !== undefined) {
    return typeof hash === 'function' ? hash : null;
  }
  try {
    const { createHash } = await import('node:crypto');
    if (typeof createHash !== 'function') {
      return null;
    }
    return data => createHash('sha1').update(data).digest('hex');
  } catch {
    // An unavailable host capability belongs only to this adapter instance.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Git SHA helpers
// ---------------------------------------------------------------------------

/** Computes a Git blob SHA-1: `SHA1("blob " + len + "\0" + content)`. */
export function hashBlob(hash: HashFn, content: Uint8Array): string {
  const header = textEncode(`blob ${content.length}\0`);
  return hash(concatBytes(header, content));
}

export interface TreeEntry {
  readonly mode: string;
  readonly path: string;
  readonly oid: string;
}

/** Builds the binary tree buffer in Git's internal format and hashes it. */
export function hashTree(hash: HashFn, entries: TreeEntry[]): string {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const parts = sorted.map(e => {
    const prefix = textEncode(`${e.mode} ${e.path}\0`);
    return concatBytes(prefix, hexDecode(e.oid));
  });
  const body = concatBytes(...parts);
  const header = textEncode(`tree ${body.length}\0`);
  return hash(concatBytes(header, body));
}

interface CommitData {
  readonly treeOid: string;
  readonly parents: readonly string[];
  readonly message: string;
  readonly author: string;
  readonly date: string;
}

/** Builds a Git-style commit string and hashes it. */
export function hashCommit(hash: HashFn, opts: CommitData): string {
  const lines = [`tree ${opts.treeOid}`];
  for (const p of opts.parents) {
    lines.push(`parent ${p}`);
  }
  lines.push(`author ${opts.author} ${opts.date}`);
  lines.push(`committer ${opts.author} ${opts.date}`);
  lines.push('');
  lines.push(opts.message);
  const bodyBytes = textEncode(lines.join('\n'));
  const header = textEncode(`commit ${bodyBytes.length}\0`);
  return hash(concatBytes(header, bodyBytes));
}

// ---------------------------------------------------------------------------
// mktree parsing
// ---------------------------------------------------------------------------

/** Parses a single mktree-formatted line into mode, path, and oid. */
export function parseMktreeEntry(line: string): TreeEntry {
  const tabIdx = line.indexOf('\t');
  if (tabIdx === -1) {
    throw new PersistenceError(
      `Invalid mktree entry (missing tab): ${line}`,
      PersistenceError.E_MISSING_OBJECT,
    );
  }
  const meta = line.slice(0, tabIdx);
  const path = line.slice(tabIdx + 1);
  const [mode = '', , oid = ''] = meta.split(' ');
  return { mode, path, oid };
}
