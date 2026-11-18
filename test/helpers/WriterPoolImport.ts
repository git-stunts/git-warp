import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { CborCodec } from '@git-stunts/git-cas';

/**
 * Many single-patch writer chains in one `git fast-import` (#1197 fixture cost). The patch
 * journal starts seven Git processes for each chain it appends, so a pool of 4,094 writers
 * cost most of a minute and 28,660 processes. Here one chain that the journal really
 * appended is the pattern, and every pool writer's chain is written from it: the same blobs,
 * trees, commit message and ref, with only the values that name the writer changed. Each
 * value the pattern does not carry as plain bytes (its patch digest, chunk blob, manifest
 * hash and slot tree) is recomputed and checked against the pattern itself before use.
 * Imported commits carry {@link POOL_COMMIT_DATE}; the journal's carry the wall clock.
 * `WriterPoolImport.integration.test.ts` shows everything else equal, object for object.
 */

/** The author and committer date of every imported commit, so imported heads are the same on every run. */
export const POOL_COMMIT_DATE = '1000000000 +0000';

/** One pool writer to import: its ref, its writer ID, and its patch as the codec encodes it. */
export type PoolWriter = { readonly ref: string; readonly writer: string; readonly patch: Uint8Array };

type PatternFile = { readonly mode: string; readonly path: string; readonly content: Buffer };
type TreeEntry = { readonly mode: string; readonly name: string; readonly oid: string };
type Substitution = readonly [from: string, to: string];

const MANIFEST = 'manifest.cbor';
/** git-cas's own manifest codec: a manifest's hash covers its encoding without the hash. */
const MANIFEST_CODEC = new CborCodec();

function git(path: string, args: readonly string[]): Buffer {
  return execFileSync('git', [...args], { cwd: path, maxBuffer: 64 * 1024 * 1024 });
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** A Git object ID, computed as Git computes it for `format`. */
function objectId(format: string, type: string, content: Uint8Array): string {
  return createHash(format === 'sha256' ? 'sha256' : 'sha1').update(`${type} ${content.length}\0`).update(content).digest('hex');
}

/** The ID of a tree that holds only `entries`, all blobs, in Git's tree order: by name bytes. */
function blobTreeId(format: string, entries: readonly TreeEntry[]): string {
  const sorted = [...entries].sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
  return objectId(format, 'tree', Buffer.concat(sorted.map((entry) => Buffer.concat([Buffer.from(`${entry.mode} ${entry.name}\0`), Buffer.from(entry.oid, 'hex')]))));
}

/** `bytes` with every occurrence of each `from` replaced by its `to`, which must be as long. */
function substituted(bytes: Buffer, substitutions: readonly Substitution[]): Buffer {
  let result = bytes;
  for (const [from, to] of substitutions) {
    if (from.length !== to.length) {
      throw new Error(`Pool import substitutes only values of equal length: ${from} for ${to}`);
    }
    const pattern = Buffer.from(from);
    const parts: Buffer[] = [];
    let start = 0;
    for (let found = result.indexOf(pattern); found !== -1; found = result.indexOf(pattern, start)) {
      parts.push(result.subarray(start, found), Buffer.from(to));
      start = found + pattern.length;
    }
    result = Buffer.concat([...parts, result.subarray(start)]);
  }
  return result;
}

/** The encoding a manifest's hash covers: the manifest without its `manifestHash`, as git-cas encodes it. */
function hashedManifest(manifest: Buffer): { readonly hash: string; readonly hashed: Buffer } {
  const decoded = MANIFEST_CODEC.decode(manifest);
  const hash = 'manifestHash' in decoded ? decoded.manifestHash : null;
  if (typeof hash !== 'string') {
    throw new Error('The pattern chain\'s manifest names no manifest hash');
  }
  const hashed = Buffer.from(MANIFEST_CODEC.encode(Object.fromEntries(Object.entries(decoded).filter(([key]) => key !== 'manifestHash'))));
  if (sha256(hashed) !== hash || !Buffer.from(MANIFEST_CODEC.encode(decoded)).equals(manifest)) {
    throw new Error('The pattern chain\'s manifest does not re-encode to itself or to its hash');
  }
  return { hash, hashed };
}

/**
 * One writer chain the patch journal appended, read back as the pattern for a pool import.
 * Reading it checks every value it will later recompute, so a change to the journal's layout
 * stops the import instead of writing chains the journal would not write.
 */
export class PoolChainPattern {
  readonly #format: string;
  readonly #writer: string;
  readonly #identity: string;
  readonly #message: Buffer;
  readonly #files: readonly PatternFile[];
  readonly #patchPath: string;
  readonly #patchBytes: number;
  readonly #manifest: PatternFile;
  readonly #hashed: Buffer;
  readonly #names: { readonly digest: string; readonly chunk: string; readonly hash: string; readonly slot: string };

  /** Reads `pool.ref` in `path`: the chain the journal appended for `pool.writer`, with `pool.patch` its only patch. */
  constructor(path: string, pool: PoolWriter) {
    this.#format = git(path, ['rev-parse', '--show-object-format']).toString().trim();
    this.#writer = pool.writer;
    const commit = git(path, ['cat-file', 'commit', pool.ref]);
    const body = commit.indexOf('\n\n');
    const author = commit.subarray(0, body).toString().split('\n').find((line) => line.startsWith('author ')) ?? '';
    this.#identity = author.slice('author '.length, author.lastIndexOf('>') + 1);
    this.#message = commit.subarray(body + 2);
    const listing = git(path, ['ls-tree', '-r', '-t', '--full-tree', pool.ref]).toString().trim().split('\n').map((line) => {
      const [meta = '', entryPath = ''] = line.split('\t');
      const [mode = '', type = '', oid = ''] = meta.split(' ');
      return { mode, type, oid, path: entryPath };
    });
    this.#files = listing.filter((entry) => entry.type === 'blob').map((entry) => ({ mode: entry.mode, path: entry.path, content: git(path, ['cat-file', 'blob', entry.oid]) }));
    const stored = this.#files.filter((file) => file.content.equals(pool.patch));
    const [patch] = stored;
    const digest = sha256(pool.patch);
    if (stored.length !== 1 || patch === undefined || !patch.path.endsWith(`/${digest}`)) {
      throw new Error('The pattern chain does not store its patch once, under the patch\'s digest');
    }
    this.#patchPath = patch.path;
    this.#patchBytes = pool.patch.length;
    const manifest = this.#files.find((file) => file.path === `${dirname(this.#patchPath)}/${MANIFEST}`);
    if (manifest === undefined) {
      throw new Error('The pattern chain stores no manifest beside its patch');
    }
    this.#manifest = manifest;
    const { hash, hashed } = hashedManifest(manifest.content);
    this.#hashed = hashed;
    const slot = listing.find((entry) => entry.type === 'tree' && entry.path === dirname(this.#patchPath))?.oid ?? '';
    this.#names = { digest, chunk: objectId(this.#format, 'blob', pool.patch), hash, slot };
    if (this.#slotTree(manifest.content, this.#names) !== slot) {
      throw new Error('The pattern chain\'s patch directory is not its manifest and its patch alone');
    }
  }

  /** The slot tree of a chain: its manifest and its patch, under the patch's digest. */
  #slotTree(manifest: Buffer, names: { readonly digest: string; readonly chunk: string }): string {
    const { mode } = this.#manifest;
    return blobTreeId(this.#format, [
      { mode, name: MANIFEST, oid: objectId(this.#format, 'blob', manifest) },
      { mode, name: names.digest, oid: names.chunk },
    ]);
  }

  /** The `git fast-import` commands that write `pool`'s chain as the journal would, dated {@link POOL_COMMIT_DATE}. */
  commands(pool: PoolWriter): Buffer {
    if (pool.writer.length !== this.#writer.length || pool.patch.length !== this.#patchBytes) {
      throw new Error(`Writer ${pool.writer} or its patch differs in length from the pattern chain's ${this.#writer}`);
    }
    const digest = sha256(pool.patch);
    const chunk = objectId(this.#format, 'blob', pool.patch);
    const named: Substitution[] = [[this.#writer, pool.writer], [this.#names.digest, digest], [this.#names.chunk, chunk]];
    const hash = sha256(substituted(this.#hashed, named));
    const manifest = substituted(this.#manifest.content, [...named, [this.#names.hash, hash]]);
    const all: Substitution[] = [...named, [this.#names.hash, hash], [this.#names.slot, this.#slotTree(manifest, { digest, chunk })]];
    const message = substituted(this.#message, all);
    const date = `${this.#identity} ${POOL_COMMIT_DATE}`;
    return Buffer.concat([
      Buffer.from(`commit ${pool.ref}\nauthor ${date}\ncommitter ${date}\ndata ${message.length}\n`), message, Buffer.from('\n'),
      ...this.#files.flatMap((file) => {
        const content = file.path === this.#patchPath ? Buffer.from(pool.patch) : substituted(file.content, all);
        return [Buffer.from(`M ${file.mode} inline ${substituted(Buffer.from(file.path), all).toString()}\ndata ${content.length}\n`), content, Buffer.from('\n')];
      }),
      Buffer.from('\n'),
    ]);
  }
}

/** Writes every chain of `pool` into the repository at `path` from `pattern`, in one `git fast-import`. */
export function importPool(path: string, pattern: PoolChainPattern, pool: readonly PoolWriter[]): void {
  execFileSync('git', ['fast-import', '--quiet', '--done'], {
    cwd: path,
    input: Buffer.concat([...pool.map((writer) => pattern.commands(writer)), Buffer.from('done\n')]),
    maxBuffer: 64 * 1024 * 1024,
  });
}
