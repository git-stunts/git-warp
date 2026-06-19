/**
 * Git-compatible hashing helpers for the in-memory persistence adapter.
 *
 * Computes Git-format SHA-1 hashes for blobs, trees, and commits so that
 * content addresses are deterministic and debuggable against real Git.
 */
import { concatBytes, hexDecode, textEncode } from '../../domain/utils/bytes.ts';
import PersistenceError from '../../domain/errors/PersistenceError.ts';
import WarpError from '../../domain/errors/WarpError.ts';

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
// Lazy node:crypto probe (module-level singleton)
// ---------------------------------------------------------------------------

type CreateHashFn = (algorithm: string) => {
  update(data: Uint8Array): { digest(encoding: string): string };
};

let _nodeCreateHash: CreateHashFn | null = null;
let _cryptoProbed = false;

/**
 * Lazily probes for node:crypto on first call. Avoids top-level await
 * which forces the module into async evaluation.
 */
async function probeNodeCrypto(): Promise<CreateHashFn | null> {
  if (_cryptoProbed) {
    return _nodeCreateHash;
  }
  _cryptoProbed = true;
  try {
    const nodeCrypto = await import('node:crypto');
    _nodeCreateHash = nodeCrypto.createHash as CreateHashFn;
  } catch {
    // Browser or non-Node runtime — hash must be injected via constructor
  }
  return _nodeCreateHash;
}

/** Default hash function using node:crypto SHA-1. */
export function defaultHash(data: Uint8Array): string {
  const createHash = _nodeCreateHash;
  if (createHash === null) {
    throw new WarpError(
      'defaultHash called before node:crypto initialization completed',
      'E_HASH_NOT_READY',
    );
  }
  return createHash('sha1').update(data).digest('hex');
}

/**
 * Eagerly kicks off the async crypto probe when no custom hash is provided.
 * Returns a promise that resolves when the probe completes.
 */
export async function initCryptoReady(hash: HashFn | undefined): Promise<void> {
  if (hash !== null && hash !== undefined) {
    return;
  }
  const createHash = await probeNodeCrypto();
  if (createHash === null) {
    throw new WarpError(
      'No hash function available. Pass { hash } to InMemoryGraphAdapter constructor.',
      'E_NO_HASH',
    );
  }
}

// ---------------------------------------------------------------------------
// Hash function type
// ---------------------------------------------------------------------------

export type HashFn = (data: Uint8Array) => string;

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
