/**
 * Git-backed adapter for {@link TrieStorePort}.
 *
 * Implements the shadow-trie ORSet's four storage methods against
 * native Git objects:
 *
 * - `writeLeaf` / `readLeaf` -> Git blobs
 * - `writeBranch` / `readBranch` -> Git trees
 *
 * Branch tree entries are named by nibble index in lowercase hex,
 * zero-padded to the minimum width required to cover the largest
 * nibble in the write-side map:
 *
 * | Fanout | Name width | Example names        |
 * |--------|------------|----------------------|
 * | 2      | 1          | `0`, `1`             |
 * | 16     | 1          | `0`..`f`             |
 * | 64     | 2          | `00`..`3f`           |
 * | 256    | 2          | `00`..`ff`           |
 *
 * The adapter does not know the trie geometry — it picks the
 * minimum hex width at write time and decodes whatever width it
 * finds at read time. Geometry enforcement belongs to the codec
 * cycle.
 *
 * All failures are raised as {@link TrieStoreError} with a typed
 * code. Raw `Error` is banned per anti-sludge policy; consumers
 * `instanceof`-dispatch on `TrieStoreError` and branch on `code`.
 *
 * This adapter performs pure blob / tree object I/O. It does not
 * create commits, does not update refs, and does not route through
 * git-cas — per design 0018 git-cas carve-out, core trie
 * publication stays on native Git.
 *
 * @see TrieStorePort
 * @see TrieStoreError
 */
import type TrieStorePort from '../../domain/orset/trie/TrieStorePort.ts';
import type { TrieBranchEntries } from '../../domain/orset/trie/TrieBranchEntries.ts';
import TrieStoreError from '../../domain/errors/TrieStoreError.ts';
import {
  type GitPlumbing,
  type GitError,
  getExitCode,
  gitDiagnosticText,
  toGitError,
} from './gitErrorClassification.ts';
import { parseNibbleName } from './trieNibbleName.ts';

// -- Error codes -------------------------------------------------------------

const E_TRIE_STORE_READ = 'E_TRIE_STORE_READ';
const E_TRIE_STORE_WRITE = 'E_TRIE_STORE_WRITE';
const E_TRIE_STORE_MISSING = 'E_TRIE_STORE_MISSING';
const E_TRIE_STORE_CORRUPT = 'E_TRIE_STORE_CORRUPT';

// -- Git mode / type constants (native Git object encoding) ------------------

const BLOB_MODE = '100644';
const TREE_MODE = '040000';
const BLOB_TYPE = 'blob';
const TREE_TYPE = 'tree';

// -- Missing-object detection (for disambiguating read errors) ---------------

const MISSING_OBJECT_HINTS: readonly string[] = [
  'bad object',
  'not a valid object name',
  'does not point to a valid object',
  'missing object',
  'could not read',
];

// -- Dependencies ------------------------------------------------------------

export interface GitTrieStoreAdapterDeps {
  readonly plumbing: GitPlumbing;
}

// -- Adapter ----------------------------------------------------------------

export default class GitTrieStoreAdapter implements TrieStorePort {
  private readonly plumbing: GitPlumbing;

  constructor(deps: GitTrieStoreAdapterDeps) {
    if (deps === null || deps === undefined) {
      throw new TrieStoreError('plumbing dependency is required', {
        code: E_TRIE_STORE_WRITE,
        context: {},
      });
    }
    this.plumbing = deps.plumbing;
  }

  async readLeaf(oid: string): Promise<Uint8Array> {
    return await this._readLeafBytes(oid);
  }

  async writeLeaf(data: Uint8Array): Promise<string> {
    const input = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const out = await this._execWrite({
      args: ['hash-object', '-w', '-t', BLOB_TYPE, '--stdin'],
      input,
    });
    return out.trim();
  }

  async readBranch(oid: string): Promise<TrieBranchEntries> {
    const raw = await this._execReadString({
      args: ['ls-tree', '-z', oid],
      oid,
    });
    return parseBranchTreeOutput(raw);
  }

  async writeBranch(children: TrieBranchEntries): Promise<string> {
    const width = nibbleNameWidth(children);
    const lines: string[] = [];
    for (const [nibble, childOid] of children) {
      const kind = await this._probeObjectKind(childOid);
      lines.push(mktreeLine({ nibble, width, childOid, kind }));
    }
    const input = lines.length === 0 ? '' : `${lines.join('\n')}\n`;
    const out = await this._execWrite({ args: ['mktree'], input });
    return out.trim();
  }

  // -- Internal helpers ------------------------------------------------------

  private async _readLeafBytes(oid: string): Promise<Uint8Array> {
    try {
      const stream = await this.plumbing.executeStream({
        args: ['cat-file', BLOB_TYPE, oid],
      });
      const collected = await stream.collect({ asString: false });
      const bytes = bufferToUint8Array(collected);
      if (bytes.length === 0) {
        await this._assertObjectExists(oid);
      }
      return bytes;
    } catch (raw) {
      throw classifyReadFailure(raw, { oid });
    }
  }

  private async _assertObjectExists(oid: string): Promise<void> {
    try {
      await this.plumbing.execute({ args: ['cat-file', '-e', oid] });
    } catch (raw) {
      throw classifyReadFailure(raw, { oid });
    }
  }

  private async _execReadString(opts: {
    args: string[];
    oid: string;
  }): Promise<string> {
    try {
      return await this.plumbing.execute({ args: opts.args });
    } catch (raw) {
      throw classifyReadFailure(raw, { oid: opts.oid });
    }
  }

  private async _execWrite(opts: {
    args: string[];
    input: string | Buffer;
  }): Promise<string> {
    try {
      return await this.plumbing.execute({ args: opts.args, input: opts.input });
    } catch (raw) {
      throw classifyWriteFailure(raw);
    }
  }

  private async _probeObjectKind(
    childOid: string,
  ): Promise<typeof BLOB_TYPE | typeof TREE_TYPE> {
    let out: string;
    try {
      out = await this.plumbing.execute({ args: ['cat-file', '-t', childOid] });
    } catch (raw) {
      throw classifyReadFailure(raw, { oid: childOid });
    }
    const kind = out.trim();
    if (kind === BLOB_TYPE || kind === TREE_TYPE) {
      return kind;
    }
    throw new TrieStoreError(
      `child object ${childOid} has unsupported type "${kind}"`,
      {
        code: E_TRIE_STORE_WRITE,
        context: { oid: childOid, type: kind },
      },
    );
  }
}

// -- Branch tree encoding ---------------------------------------------------

interface MktreeLineInput {
  readonly nibble: number;
  readonly width: number;
  readonly childOid: string;
  readonly kind: typeof BLOB_TYPE | typeof TREE_TYPE;
}

function mktreeLine(input: MktreeLineInput): string {
  const name = input.nibble.toString(16).padStart(input.width, '0');
  const mode = input.kind === BLOB_TYPE ? BLOB_MODE : TREE_MODE;
  return `${mode} ${input.kind} ${input.childOid}\t${name}`;
}

function nibbleNameWidth(children: TrieBranchEntries): number {
  let maxNibble = 0;
  for (const nibble of children.keys()) {
    if (nibble > maxNibble) {
      maxNibble = nibble;
    }
  }
  const hexDigits = maxNibble === 0 ? 1 : Math.ceil(Math.log2(maxNibble + 1) / 4);
  return Math.max(1, hexDigits);
}

// -- Branch tree decoding ---------------------------------------------------

function parseBranchTreeOutput(raw: string): TrieBranchEntries {
  const entries = new Map<number, string>();
  if (raw.length === 0) {
    return entries;
  }
  for (const record of raw.split('\0')) {
    if (record === '') {
      continue;
    }
    const { nibble, childOid } = parseBranchTreeRecord(record);
    entries.set(nibble, childOid);
  }
  return entries;
}

function parseBranchTreeRecord(record: string): {
  nibble: number;
  childOid: string;
} {
  const tabIndex = record.indexOf('\t');
  if (tabIndex === -1) {
    throw new TrieStoreError(
      `malformed ls-tree record: ${record}`,
      { code: E_TRIE_STORE_CORRUPT, context: { record } },
    );
  }
  const meta = record.slice(0, tabIndex);
  const name = record.slice(tabIndex + 1);
  const parts = meta.split(' ');
  const childOid = parts[2];
  if (typeof childOid !== 'string' || childOid.length === 0) {
    throw new TrieStoreError(
      `ls-tree record missing OID: ${record}`,
      { code: E_TRIE_STORE_CORRUPT, context: { record } },
    );
  }
  const nibble = parseNibbleName(name);
  return { nibble, childOid };
}

// -- Byte boundary helpers --------------------------------------------------

function bufferToUint8Array(collected: Buffer | string): Uint8Array {
  if (typeof collected === 'string') {
    return new TextEncoder().encode(collected);
  }
  return new Uint8Array(
    collected.buffer.slice(
      collected.byteOffset,
      collected.byteOffset + collected.byteLength,
    ),
  );
}

// -- Error classification ---------------------------------------------------

function classifyReadFailure(
  raw: unknown,
  hint: { readonly oid: string },
): TrieStoreError {
  const err = toGitError(raw);
  if (err instanceof TrieStoreError) {
    return err;
  }
  if (isMissingObject(err)) {
    return new TrieStoreError(`Git object ${hint.oid} does not exist`, {
      code: E_TRIE_STORE_MISSING,
      context: { oid: hint.oid, cause: err.message },
    });
  }
  return new TrieStoreError(`read failed for ${hint.oid}: ${err.message}`, {
    code: E_TRIE_STORE_READ,
    context: { oid: hint.oid, cause: err.message },
  });
}

function classifyWriteFailure(raw: unknown): TrieStoreError {
  const err = toGitError(raw);
  if (err instanceof TrieStoreError) {
    return err;
  }
  return new TrieStoreError(`Git write failed: ${err.message}`, {
    code: E_TRIE_STORE_WRITE,
    context: { cause: err.message },
  });
}

function isMissingObject(err: GitError): boolean {
  const code = getExitCode(err);
  if (code !== 128 && code !== 1) {
    return false;
  }
  const diag = gitDiagnosticText(err);
  const msg = (err.message ?? '').toLowerCase();
  const haystack = `${diag} ${msg}`;
  return MISSING_OBJECT_HINTS.some((hint) => haystack.includes(hint));
}
