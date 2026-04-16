/**
 * Unit tests for GitTrieStoreAdapter.
 *
 * Uses an inline in-memory `GitPlumbing` double that emulates just
 * enough of git plumbing to exercise leaf/branch round-trips and the
 * four TrieStoreError codes. No real git subprocess runs here — the
 * integration suite covers that.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import GitTrieStoreAdapter from '../../../../src/infrastructure/adapters/GitTrieStoreAdapter.ts';
import TrieStoreError from '../../../../src/domain/errors/TrieStoreError.ts';
import type { TrieBranchEntries } from '../../../../src/domain/orset/trie/TrieBranchEntries.ts';
import type {
  CollectableStream,
  GitPlumbing,
} from '../../../../src/infrastructure/adapters/gitErrorClassification.ts';

// -- In-memory plumbing double ----------------------------------------------

class MissingObjectError extends Error {
  readonly exitCode = 128;
  readonly details: { readonly stderr: string; readonly code: number };

  constructor(oid: string) {
    super(`fatal: Not a valid object name ${oid}`);
    this.details = {
      stderr: `fatal: Not a valid object name ${oid}`,
      code: 128,
    };
  }
}

class OpaqueGitError extends Error {
  readonly exitCode = 128;
  readonly details: { readonly stderr: string; readonly code: number };

  constructor(message: string) {
    super(message);
    this.details = { stderr: message, code: 128 };
  }
}

interface StoredBranchEntry {
  readonly nibbleName: string;
  readonly childOid: string;
  readonly kind: 'blob' | 'tree';
}

interface CorruptEntry {
  readonly rawName: string;
  readonly childOid: string;
  readonly kind: 'blob' | 'tree';
}

class InMemoryGitPlumbing implements GitPlumbing {
  readonly emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  private readonly blobs = new Map<string, Uint8Array>();
  private readonly trees = new Map<string, readonly StoredBranchEntry[]>();
  private readonly corruptTrees = new Map<string, readonly CorruptEntry[]>();
  private nextOid = 1;
  public lastMktreeInput = '';

  async execute(opts: {
    args: string[];
    input?: string | Buffer;
  }): Promise<string> {
    const [cmd, ...rest] = opts.args;
    switch (cmd) {
      case 'hash-object':
        return this._handleHashObject(opts.input);
      case 'mktree':
        return this._handleMktree(opts.input);
      case 'cat-file':
        return this._handleCatFile(rest);
      case 'ls-tree':
        return this._handleLsTree(rest);
      default:
        throw new OpaqueGitError(`unsupported command: ${cmd ?? ''}`);
    }
  }

  async executeStream(opts: { args: string[] }): Promise<CollectableStream> {
    const [cmd, sub, oid] = opts.args;
    if (cmd === 'cat-file' && sub === 'blob' && typeof oid === 'string') {
      const blob = this.blobs.get(oid);
      if (!blob) {
        return makeStream(new Uint8Array(0));
      }
      return makeStream(blob);
    }
    throw new OpaqueGitError(`unsupported stream command: ${opts.args.join(' ')}`);
  }

  putBlobRaw(bytes: Uint8Array): string {
    return this._storeBlob(bytes);
  }

  putTreeRaw(entries: readonly StoredBranchEntry[]): string {
    const oid = this._fabricateOid('tree');
    this.trees.set(oid, entries);
    return oid;
  }

  putCorruptTree(entries: readonly CorruptEntry[]): string {
    const oid = this._fabricateOid('tree');
    this.corruptTrees.set(oid, entries);
    return oid;
  }

  private _handleHashObject(input?: string | Buffer): string {
    if (!Buffer.isBuffer(input)) {
      throw new OpaqueGitError('hash-object requires Buffer input');
    }
    return this._storeBlob(new Uint8Array(input));
  }

  private _handleMktree(input?: string | Buffer): string {
    const raw = typeof input === 'string' ? input : (input?.toString('utf8') ?? '');
    this.lastMktreeInput = raw;
    const entries: StoredBranchEntry[] = [];
    for (const line of raw.split('\n')) {
      if (line === '') {
        continue;
      }
      const tab = line.indexOf('\t');
      if (tab === -1) {
        throw new OpaqueGitError(`malformed mktree input: ${line}`);
      }
      const meta = line.slice(0, tab).split(' ');
      const nibbleName = line.slice(tab + 1);
      const [, type, childOid] = meta;
      if ((type !== 'blob' && type !== 'tree') || typeof childOid !== 'string') {
        throw new OpaqueGitError(`bad mktree entry: ${line}`);
      }
      entries.push({ nibbleName, childOid, kind: type });
    }
    entries.sort((a, b) => (a.nibbleName < b.nibbleName ? -1 : a.nibbleName > b.nibbleName ? 1 : 0));
    const oid = this._fabricateOid('tree');
    this.trees.set(oid, entries);
    return oid;
  }

  private _handleCatFile(rest: readonly string[]): string {
    const [flag, oid] = rest;
    if (flag === '-t' && typeof oid === 'string') {
      if (this.blobs.has(oid)) {
        return 'blob\n';
      }
      if (this.trees.has(oid) || this.corruptTrees.has(oid)) {
        return 'tree\n';
      }
      throw new MissingObjectError(oid);
    }
    if (flag === '-e' && typeof oid === 'string') {
      if (this.blobs.has(oid) || this.trees.has(oid) || this.corruptTrees.has(oid)) {
        return '';
      }
      throw new MissingObjectError(oid);
    }
    throw new OpaqueGitError(`unsupported cat-file flags: ${rest.join(' ')}`);
  }

  private _handleLsTree(rest: readonly string[]): string {
    const oid = rest[rest.length - 1];
    if (typeof oid !== 'string') {
      throw new OpaqueGitError('ls-tree missing oid');
    }
    const corrupt = this.corruptTrees.get(oid);
    if (corrupt) {
      return formatCorruptLsTreeOutput(corrupt);
    }
    const entries = this.trees.get(oid);
    if (!entries) {
      throw new MissingObjectError(oid);
    }
    return formatLsTreeOutput(entries);
  }

  private _storeBlob(bytes: Uint8Array): string {
    const existing = this._findBlobOid(bytes);
    if (existing !== null) {
      return existing;
    }
    const oid = this._fabricateOid('blob');
    this.blobs.set(oid, bytes);
    return oid;
  }

  private _findBlobOid(bytes: Uint8Array): string | null {
    for (const [oid, stored] of this.blobs) {
      if (bytesEqual(stored, bytes)) {
        return oid;
      }
    }
    return null;
  }

  private _fabricateOid(tag: 'blob' | 'tree'): string {
    const n = this.nextOid;
    this.nextOid += 1;
    const hex = n.toString(16).padStart(8, '0');
    return `${tag === 'blob' ? 'bb' : 'tt'}${'0'.repeat(30)}${hex}`.slice(0, 40);
  }
}

function makeStream(bytes: Uint8Array): CollectableStream {
  return {
    [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
      let done = false;
      return {
        next(): Promise<IteratorResult<Uint8Array>> {
          if (done) {
            return Promise.resolve({ value: undefined, done: true });
          }
          done = true;
          return Promise.resolve({ value: bytes, done: false });
        },
      };
    },
    async collect(collectOpts?: { asString?: boolean }): Promise<Buffer | string> {
      if (collectOpts?.asString === true) {
        return Buffer.from(bytes).toString('utf8');
      }
      return Buffer.from(bytes);
    },
  };
}

function formatLsTreeOutput(entries: readonly StoredBranchEntry[]): string {
  // Real `ls-tree -z` NUL-terminates every record, including the last.
  // Emulate that so the empty-tail-record branch in the adapter's
  // parser is exercised.
  return entries
    .map((e) => `${e.kind === 'blob' ? '100644' : '040000'} ${e.kind} ${e.childOid}\t${e.nibbleName}\0`)
    .join('');
}

function formatCorruptLsTreeOutput(entries: readonly CorruptEntry[]): string {
  return entries
    .map((e) => `${e.kind === 'blob' ? '100644' : '040000'} ${e.kind} ${e.childOid}\t${e.rawName}\0`)
    .join('');
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

// -- Test suite -------------------------------------------------------------

describe('GitTrieStoreAdapter', () => {
  let plumbing: InMemoryGitPlumbing;
  let adapter: GitTrieStoreAdapter;

  beforeEach(() => {
    plumbing = new InMemoryGitPlumbing();
    adapter = new GitTrieStoreAdapter({ plumbing });
  });

  describe('constructor', () => {
    it('rejects a null deps payload with a typed TrieStoreError', () => {
      // Simulate a bad-faith caller who passes null at the JS boundary.
      // We funnel through `unknown` and a factory so the type system
      // only sees a typed constructor call at the edge.
      const makeWithNull = (): GitTrieStoreAdapter => {
        const factory = GitTrieStoreAdapter as unknown as new (
          deps: unknown,
        ) => GitTrieStoreAdapter;
        return new factory(null);
      };
      expect(makeWithNull).toThrow(TrieStoreError);
    });
  });

  describe('writeLeaf / readLeaf round-trip', () => {
    it('round-trips an empty leaf', async () => {
      const oid = await adapter.writeLeaf(new Uint8Array());
      const read = await adapter.readLeaf(oid);
      expect(read).toEqual(new Uint8Array());
    });

    it('round-trips a single-byte leaf', async () => {
      const oid = await adapter.writeLeaf(new Uint8Array([42]));
      const read = await adapter.readLeaf(oid);
      expect(read.length).toBe(1);
      expect(read[0]).toBe(42);
    });

    it('round-trips a multi-byte leaf with binary content', async () => {
      const payload = new Uint8Array([0, 1, 2, 255, 128, 64, 32, 0]);
      const oid = await adapter.writeLeaf(payload);
      const read = await adapter.readLeaf(oid);
      expect(read).toEqual(payload);
    });

    it('round-trips a 1 MiB leaf', async () => {
      const big = new Uint8Array(1024 * 1024);
      for (let i = 0; i < big.length; i += 1) {
        big[i] = (i * 31) & 0xff;
      }
      const oid = await adapter.writeLeaf(big);
      const read = await adapter.readLeaf(oid);
      expect(read.byteLength).toBe(big.byteLength);
      expect(read[0]).toBe(big[0]);
      expect(read[big.length - 1]).toBe(big[big.length - 1]);
    });

    it('raises E_TRIE_STORE_MISSING when the OID does not exist', async () => {
      await expect(adapter.readLeaf('deadbeef')).rejects.toBeInstanceOf(TrieStoreError);
      try {
        await adapter.readLeaf('deadbeef');
      } catch (err) {
        expect(err).toBeInstanceOf(TrieStoreError);
        if (err instanceof TrieStoreError) {
          expect(err.code).toBe('E_TRIE_STORE_MISSING');
          expect(err.context['oid']).toBe('deadbeef');
        }
      }
    });
  });

  describe('writeBranch / readBranch round-trip', () => {
    it('round-trips a 2-way branch', async () => {
      const leafA = await adapter.writeLeaf(new Uint8Array([1]));
      const leafB = await adapter.writeLeaf(new Uint8Array([2]));
      const children: TrieBranchEntries = new Map<number, string>([
        [0, leafA],
        [1, leafB],
      ]);
      const branchOid = await adapter.writeBranch(children);
      const read = await adapter.readBranch(branchOid);
      expect(read.size).toBe(2);
      expect(read.get(0)).toBe(leafA);
      expect(read.get(1)).toBe(leafB);
    });

    it('round-trips a sparse 16-way branch', async () => {
      const oids: Record<number, string> = {};
      const children = new Map<number, string>();
      for (const nibble of [0, 7, 15]) {
        const oid = await adapter.writeLeaf(new Uint8Array([nibble]));
        oids[nibble] = oid;
        children.set(nibble, oid);
      }
      const branchOid = await adapter.writeBranch(children);
      const read = await adapter.readBranch(branchOid);
      expect(read.size).toBe(3);
      expect(read.get(0)).toBe(oids[0]);
      expect(read.get(7)).toBe(oids[7]);
      expect(read.get(15)).toBe(oids[15]);
    });

    it('round-trips a 64-way branch', async () => {
      const children = new Map<number, string>();
      for (let i = 0; i < 64; i += 1) {
        const oid = await adapter.writeLeaf(new Uint8Array([i]));
        children.set(i, oid);
      }
      const branchOid = await adapter.writeBranch(children);
      const read = await adapter.readBranch(branchOid);
      expect(read.size).toBe(64);
      for (let i = 0; i < 64; i += 1) {
        expect(read.get(i)).toBe(children.get(i));
      }
    });

    it('round-trips a wide 256-way branch', async () => {
      const children = new Map<number, string>();
      for (let i = 0; i < 256; i += 1) {
        const oid = await adapter.writeLeaf(new Uint8Array([i & 0xff, (i >> 8) & 0xff]));
        children.set(i, oid);
      }
      const branchOid = await adapter.writeBranch(children);
      const read = await adapter.readBranch(branchOid);
      expect(read.size).toBe(256);
      expect(read.get(0)).toBe(children.get(0));
      expect(read.get(128)).toBe(children.get(128));
      expect(read.get(255)).toBe(children.get(255));
    });

    it('writes entries named `0` and `f` for a 16-way branch with keys {0, 15}', async () => {
      const leafA = await adapter.writeLeaf(new Uint8Array([10]));
      const leafB = await adapter.writeLeaf(new Uint8Array([15]));
      const children = new Map<number, string>([
        [0, leafA],
        [15, leafB],
      ]);
      const branchOid = await adapter.writeBranch(children);
      expect(plumbing.lastMktreeInput).toContain('\t0\n');
      expect(plumbing.lastMktreeInput).toContain('\tf\n');
      const read = await adapter.readBranch(branchOid);
      expect(read.get(0)).toBe(leafA);
      expect(read.get(15)).toBe(leafB);
    });

    it('widens the nibble-name width to 2 when a nibble >= 16 appears', async () => {
      const leafA = await adapter.writeLeaf(new Uint8Array([1]));
      const leafB = await adapter.writeLeaf(new Uint8Array([2]));
      const children = new Map<number, string>([
        [0, leafA],
        [200, leafB],
      ]);
      await adapter.writeBranch(children);
      expect(plumbing.lastMktreeInput).toContain('\t00\n');
      expect(plumbing.lastMktreeInput).toContain('\tc8\n');
    });

    it('tags branch-of-branch children with tree mode 040000', async () => {
      const leaf = await adapter.writeLeaf(new Uint8Array([9]));
      const innerBranch = await adapter.writeBranch(new Map<number, string>([[0, leaf]]));
      const outer = new Map<number, string>([[3, innerBranch]]);
      await adapter.writeBranch(outer);
      expect(plumbing.lastMktreeInput).toMatch(/^040000 tree /m);
    });

    it('tags leaf children with blob mode 100644', async () => {
      const leaf = await adapter.writeLeaf(new Uint8Array([9]));
      const outer = new Map<number, string>([[3, leaf]]);
      await adapter.writeBranch(outer);
      expect(plumbing.lastMktreeInput).toMatch(/^100644 blob /m);
    });

    it('writes an empty mktree input for an empty child map', async () => {
      const oid = await adapter.writeBranch(new Map<number, string>());
      const read = await adapter.readBranch(oid);
      expect(plumbing.lastMktreeInput).toBe('');
      expect(read.size).toBe(0);
    });

    it('raises E_TRIE_STORE_MISSING when the branch OID does not exist', async () => {
      await expect(adapter.readBranch('notfound')).rejects.toBeInstanceOf(TrieStoreError);
      try {
        await adapter.readBranch('notfound');
      } catch (err) {
        expect(err).toBeInstanceOf(TrieStoreError);
        if (err instanceof TrieStoreError) {
          expect(err.code).toBe('E_TRIE_STORE_MISSING');
        }
      }
    });
  });

  describe('error paths', () => {
    it('raises E_TRIE_STORE_CORRUPT for a non-hex tree entry name', async () => {
      const oid = plumbing.putCorruptTree([
        { rawName: 'ZZ', childOid: 'aabb', kind: 'blob' },
      ]);
      try {
        await adapter.readBranch(oid);
        throw new Error('expected TrieStoreError');
      } catch (err) {
        expect(err).toBeInstanceOf(TrieStoreError);
        if (err instanceof TrieStoreError) {
          expect(err.code).toBe('E_TRIE_STORE_CORRUPT');
          expect(err.context['name']).toBe('ZZ');
        }
      }
    });

    it('raises E_TRIE_STORE_CORRUPT for an empty tree entry name', async () => {
      const oid = plumbing.putCorruptTree([
        { rawName: '', childOid: 'aabb', kind: 'blob' },
      ]);
      try {
        await adapter.readBranch(oid);
        throw new Error('expected TrieStoreError');
      } catch (err) {
        expect(err).toBeInstanceOf(TrieStoreError);
        if (err instanceof TrieStoreError) {
          expect(err.code).toBe('E_TRIE_STORE_CORRUPT');
        }
      }
    });

    it('raises E_TRIE_STORE_CORRUPT for a malformed ls-tree record with no tab', async () => {
      class TabLessPlumbing implements GitPlumbing {
        readonly emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
        async execute(opts: {
          args: string[];
          input?: string | Buffer;
        }): Promise<string> {
          const [cmd] = opts.args;
          if (cmd === 'ls-tree') {
            return '040000 tree aabb'; // no tab/name
          }
          throw new Error(`unsupported: ${cmd ?? ''}`);
        }
        async executeStream(): Promise<CollectableStream> {
          throw new Error('unused');
        }
      }
      const tabLess = new GitTrieStoreAdapter({ plumbing: new TabLessPlumbing() });
      try {
        await tabLess.readBranch('aabbccdd');
        throw new Error('expected TrieStoreError');
      } catch (err) {
        expect(err).toBeInstanceOf(TrieStoreError);
        if (err instanceof TrieStoreError) {
          expect(err.code).toBe('E_TRIE_STORE_CORRUPT');
        }
      }
    });

    it('raises E_TRIE_STORE_CORRUPT when an ls-tree record is missing an OID column', async () => {
      class ShortMetaPlumbing implements GitPlumbing {
        readonly emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
        async execute(opts: {
          args: string[];
          input?: string | Buffer;
        }): Promise<string> {
          const [cmd] = opts.args;
          if (cmd === 'ls-tree') {
            return '040000 tree\t0';
          }
          throw new Error(`unsupported: ${cmd ?? ''}`);
        }
        async executeStream(): Promise<CollectableStream> {
          throw new Error('unused');
        }
      }
      const shortMeta = new GitTrieStoreAdapter({ plumbing: new ShortMetaPlumbing() });
      try {
        await shortMeta.readBranch('aabb');
        throw new Error('expected TrieStoreError');
      } catch (err) {
        expect(err).toBeInstanceOf(TrieStoreError);
        if (err instanceof TrieStoreError) {
          expect(err.code).toBe('E_TRIE_STORE_CORRUPT');
        }
      }
    });

    it('raises E_TRIE_STORE_MISSING when writeBranch probes a child OID that does not exist', async () => {
      try {
        await adapter.writeBranch(new Map<number, string>([[0, 'ghost-oid']]));
        throw new Error('expected TrieStoreError');
      } catch (err) {
        expect(err).toBeInstanceOf(TrieStoreError);
        if (err instanceof TrieStoreError) {
          expect(err.code).toBe('E_TRIE_STORE_MISSING');
          expect(err.context['oid']).toBe('ghost-oid');
        }
      }
    });

    it('raises E_TRIE_STORE_WRITE when writeBranch encounters a non-blob, non-tree child', async () => {
      class TaggedPlumbing implements GitPlumbing {
        readonly emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
        async execute(opts: {
          args: string[];
          input?: string | Buffer;
        }): Promise<string> {
          const [cmd, flag] = opts.args;
          if (cmd === 'cat-file' && flag === '-t') {
            return 'commit\n';
          }
          throw new Error(`unsupported: ${cmd ?? ''}`);
        }
        async executeStream(): Promise<CollectableStream> {
          throw new Error('unused');
        }
      }
      const tagged = new GitTrieStoreAdapter({ plumbing: new TaggedPlumbing() });
      try {
        await tagged.writeBranch(new Map<number, string>([[0, 'aaaabbbb']]));
        throw new Error('expected TrieStoreError');
      } catch (err) {
        expect(err).toBeInstanceOf(TrieStoreError);
        if (err instanceof TrieStoreError) {
          expect(err.code).toBe('E_TRIE_STORE_WRITE');
          expect(err.context['type']).toBe('commit');
        }
      }
    });

    it('raises E_TRIE_STORE_WRITE when mktree itself fails', async () => {
      class FailingMktree implements GitPlumbing {
        readonly emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
        async execute(opts: {
          args: string[];
          input?: string | Buffer;
        }): Promise<string> {
          const [cmd, flag] = opts.args;
          if (cmd === 'cat-file' && flag === '-t') {
            return 'blob\n';
          }
          if (cmd === 'mktree') {
            throw new OpaqueGitError('mktree failed');
          }
          throw new Error(`unsupported: ${cmd ?? ''}`);
        }
        async executeStream(): Promise<CollectableStream> {
          throw new Error('unused');
        }
      }
      const failing = new GitTrieStoreAdapter({ plumbing: new FailingMktree() });
      try {
        await failing.writeBranch(new Map<number, string>([[0, 'aaaabbbb']]));
        throw new Error('expected TrieStoreError');
      } catch (err) {
        expect(err).toBeInstanceOf(TrieStoreError);
        if (err instanceof TrieStoreError) {
          expect(err.code).toBe('E_TRIE_STORE_WRITE');
        }
      }
    });

    it('raises E_TRIE_STORE_WRITE when hash-object itself fails', async () => {
      class FailingHash implements GitPlumbing {
        readonly emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
        async execute(opts: { args: string[] }): Promise<string> {
          if (opts.args[0] === 'hash-object') {
            throw new OpaqueGitError('hash-object failed');
          }
          throw new Error(`unsupported: ${opts.args[0] ?? ''}`);
        }
        async executeStream(): Promise<CollectableStream> {
          throw new Error('unused');
        }
      }
      const failing = new GitTrieStoreAdapter({ plumbing: new FailingHash() });
      try {
        await failing.writeLeaf(new Uint8Array([1]));
        throw new Error('expected TrieStoreError');
      } catch (err) {
        expect(err).toBeInstanceOf(TrieStoreError);
        if (err instanceof TrieStoreError) {
          expect(err.code).toBe('E_TRIE_STORE_WRITE');
        }
      }
    });

    it('raises E_TRIE_STORE_READ for opaque non-missing read failures', async () => {
      class TransientReader implements GitPlumbing {
        readonly emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
        async execute(): Promise<string> {
          throw new OpaqueGitError('connection reset');
        }
        async executeStream(): Promise<CollectableStream> {
          throw new OpaqueGitError('connection reset');
        }
      }
      const opaque = new GitTrieStoreAdapter({ plumbing: new TransientReader() });
      try {
        await opaque.readLeaf('aabbccdd');
        throw new Error('expected TrieStoreError');
      } catch (err) {
        expect(err).toBeInstanceOf(TrieStoreError);
        if (err instanceof TrieStoreError) {
          expect(err.code).toBe('E_TRIE_STORE_READ');
        }
      }
    });

    it('raises E_TRIE_STORE_READ for a failure with an exit code other than 128 or 1', async () => {
      class WeirdCodePlumbing implements GitPlumbing {
        readonly emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
        async execute(): Promise<string> {
          const err: Error & {
            exitCode?: number;
            details?: { stderr?: string; code?: number };
          } = new Error('signal killed');
          err.exitCode = 137;
          err.details = { stderr: 'killed by SIGKILL', code: 137 };
          throw err;
        }
        async executeStream(): Promise<CollectableStream> {
          const err: Error & {
            exitCode?: number;
            details?: { stderr?: string; code?: number };
          } = new Error('signal killed');
          err.exitCode = 137;
          err.details = { stderr: 'killed by SIGKILL', code: 137 };
          throw err;
        }
      }
      const weird = new GitTrieStoreAdapter({ plumbing: new WeirdCodePlumbing() });
      try {
        await weird.readLeaf('aabbccdd');
        throw new Error('expected TrieStoreError');
      } catch (err) {
        expect(err).toBeInstanceOf(TrieStoreError);
        if (err instanceof TrieStoreError) {
          expect(err.code).toBe('E_TRIE_STORE_READ');
        }
      }
    });

    it('passes a pre-wrapped TrieStoreError through writeBranch unchanged', async () => {
      class PreWrappingPlumbing implements GitPlumbing {
        readonly emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
        async execute(opts: {
          args: string[];
          input?: string | Buffer;
        }): Promise<string> {
          const [cmd, flag] = opts.args;
          if (cmd === 'cat-file' && flag === '-t') {
            return 'blob\n';
          }
          if (cmd === 'mktree') {
            throw new TrieStoreError('pre-wrapped write error', {
              code: 'E_TRIE_STORE_WRITE',
              context: { preWrapped: true },
            });
          }
          throw new OpaqueGitError(`unexpected: ${cmd ?? ''}`);
        }
        async executeStream(): Promise<CollectableStream> {
          throw new OpaqueGitError('unused');
        }
      }
      const preWrap = new GitTrieStoreAdapter({ plumbing: new PreWrappingPlumbing() });
      try {
        await preWrap.writeBranch(new Map<number, string>([[0, 'aabb']]));
        throw new Error('expected TrieStoreError');
      } catch (err) {
        expect(err).toBeInstanceOf(TrieStoreError);
        if (err instanceof TrieStoreError) {
          expect(err.code).toBe('E_TRIE_STORE_WRITE');
          expect(err.context['preWrapped']).toBe(true);
        }
      }
    });

    it('decodes a string-returned stream via TextEncoder', async () => {
      class StringStreamPlumbing implements GitPlumbing {
        readonly emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
        async execute(): Promise<string> {
          throw new OpaqueGitError('unused');
        }
        async executeStream(): Promise<CollectableStream> {
          return {
            [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
              return {
                async next(): Promise<IteratorResult<Uint8Array>> {
                  return { value: undefined, done: true };
                },
              };
            },
            async collect(): Promise<Buffer | string> {
              return 'hello-as-string';
            },
          };
        }
      }
      const stringPlumbing = new GitTrieStoreAdapter({
        plumbing: new StringStreamPlumbing(),
      });
      const bytes = await stringPlumbing.readLeaf('aabb');
      expect(new TextDecoder().decode(bytes)).toBe('hello-as-string');
    });

    it('treats a silent exit-1 existence-probe failure as a missing object', async () => {
      class SilentProbe implements GitPlumbing {
        readonly emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
        async execute(opts: { args: string[] }): Promise<string> {
          const [cmd, flag, oid] = opts.args;
          if (cmd === 'cat-file' && flag === '-e' && typeof oid === 'string') {
            const err: Error & {
              exitCode?: number;
              details?: { stderr?: string; code?: number };
            } = new Error('');
            err.exitCode = 1;
            err.details = { stderr: '', code: 1 };
            throw err;
          }
          throw new OpaqueGitError(`unsupported: ${cmd ?? ''}`);
        }
        async executeStream(): Promise<CollectableStream> {
          return makeStream(new Uint8Array());
        }
      }
      const silent = new GitTrieStoreAdapter({ plumbing: new SilentProbe() });
      try {
        await silent.readLeaf('aabbccdd');
        throw new Error('expected TrieStoreError');
      } catch (err) {
        expect(err).toBeInstanceOf(TrieStoreError);
        if (err instanceof TrieStoreError) {
          expect(err.code).toBe('E_TRIE_STORE_MISSING');
        }
      }
    });

    it('isSilentMissing returns false for a pre-wrapped TrieStoreError on the probe path', async () => {
      class PrewrapProbe implements GitPlumbing {
        readonly emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
        async execute(opts: { args: string[] }): Promise<string> {
          const [cmd, flag] = opts.args;
          if (cmd === 'cat-file' && flag === '-e') {
            throw new TrieStoreError('pre-wrapped', {
              code: 'E_TRIE_STORE_READ',
              context: { reason: 'synthetic' },
            });
          }
          throw new OpaqueGitError(`unsupported: ${cmd ?? ''}`);
        }
        async executeStream(): Promise<CollectableStream> {
          return makeStream(new Uint8Array());
        }
      }
      const prewrap = new GitTrieStoreAdapter({ plumbing: new PrewrapProbe() });
      try {
        await prewrap.readLeaf('aabbccdd');
        throw new Error('expected TrieStoreError');
      } catch (err) {
        expect(err).toBeInstanceOf(TrieStoreError);
        if (err instanceof TrieStoreError) {
          expect(err.context['reason']).toBe('synthetic');
        }
      }
    });

    it('isSilentMissing returns false for a non-1 exit code on the probe path', async () => {
      class BigCodeProbe implements GitPlumbing {
        readonly emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
        async execute(opts: { args: string[] }): Promise<string> {
          const [cmd, flag] = opts.args;
          if (cmd === 'cat-file' && flag === '-e') {
            const err: Error & {
              exitCode?: number;
              details?: { stderr?: string; code?: number };
            } = new Error('fatal: bad object 0000');
            err.exitCode = 128;
            err.details = { stderr: 'fatal: bad object 0000', code: 128 };
            throw err;
          }
          throw new OpaqueGitError(`unsupported: ${cmd ?? ''}`);
        }
        async executeStream(): Promise<CollectableStream> {
          return makeStream(new Uint8Array());
        }
      }
      const bigCode = new GitTrieStoreAdapter({ plumbing: new BigCodeProbe() });
      try {
        await bigCode.readLeaf('aabbccdd');
        throw new Error('expected TrieStoreError');
      } catch (err) {
        expect(err).toBeInstanceOf(TrieStoreError);
        if (err instanceof TrieStoreError) {
          // Missing-object classification kicks in via pattern
          // matching on the stderr text.
          expect(err.code).toBe('E_TRIE_STORE_MISSING');
        }
      }
    });

    it('propagates the existence probe error when a zero-byte read hits a missing object', async () => {
      class EmptyStream implements GitPlumbing {
        readonly emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
        async execute(opts: { args: string[] }): Promise<string> {
          const [cmd, flag, oid] = opts.args;
          if (cmd === 'cat-file' && flag === '-e' && typeof oid === 'string') {
            throw new MissingObjectError(oid);
          }
          throw new OpaqueGitError(`unsupported: ${cmd ?? ''}`);
        }
        async executeStream(): Promise<CollectableStream> {
          return makeStream(new Uint8Array());
        }
      }
      const empty = new GitTrieStoreAdapter({ plumbing: new EmptyStream() });
      try {
        await empty.readLeaf('aabbccdd');
        throw new Error('expected TrieStoreError');
      } catch (err) {
        expect(err).toBeInstanceOf(TrieStoreError);
        if (err instanceof TrieStoreError) {
          expect(err.code).toBe('E_TRIE_STORE_MISSING');
        }
      }
    });
  });

  describe('Uint8Array boundary', () => {
    it('returns a Uint8Array — not a Buffer — from readLeaf', async () => {
      const oid = await adapter.writeLeaf(new Uint8Array([1, 2, 3]));
      const read = await adapter.readLeaf(oid);
      expect(read).toBeInstanceOf(Uint8Array);
      expect(Buffer.isBuffer(read)).toBe(false);
    });
  });
});
