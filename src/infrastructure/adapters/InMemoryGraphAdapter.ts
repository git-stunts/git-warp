/* eslint-disable @typescript-eslint/require-await -- all async methods match the port contract */
/**
 * In-memory persistence adapter for WARP graph storage.
 *
 * Implements the same GraphPersistencePort contract as GitGraphAdapter
 * but stores all data in Maps. Designed for fast unit/integration tests.
 */
import type { CommitLogChunk, CommitNodeOptions, CommitNodeWithTreeOptions, LogNodesOptions, NodeInfo, PingResult } from '../../ports/CommitPort.ts';
import type { ListRefsOptions } from '../../ports/RefPort.ts';
import GraphPersistencePort from '../../ports/GraphPersistencePort.ts';
import WarpStream from '../../domain/stream/WarpStream.ts';
import PersistenceError from '../../domain/errors/PersistenceError.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import TreeEntryFound from '../../domain/tree/TreeEntryFound.ts';
import type TreeEntryLimit from '../../domain/tree/TreeEntryLimit.ts';
import TreeEntryMissing from '../../domain/tree/TreeEntryMissing.ts';
import TreeEntryPath from '../../domain/tree/TreeEntryPath.ts';
import TreeEntryPrefixBatch from '../../domain/tree/TreeEntryPrefixBatch.ts';
import type { TreeEntryProbeResult } from '../../ports/TreeEntryProbePort.ts';
import { validateOid, validateRef, validateLimit, validateConfigKey } from './adapterValidation.ts';
import {
  type HashFn,
  type TreeEntry,
  toBytes,
  defaultHash,
  initCryptoReady,
  hashBlob,
  hashTree,
  hashCommit,
  parseMktreeEntry,
} from './inMemoryHashing.ts';

const EMPTY_TREE_OID = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

interface CommitRecord {
  readonly treeOid: string;
  readonly parents: string[];
  readonly message: string;
  readonly author: string;
  readonly date: string;
}

interface InMemoryAdapterOptions {
  readonly author?: string;
  readonly clock?: { now(): number };
  readonly hash?: HashFn;
}

function treeEntryIndex(entries: readonly TreeEntry[]): Map<string, TreeEntry> {
  const index = new Map<string, TreeEntry>();
  for (const entry of entries) {
    index.set(entry.path, entry);
  }
  return index;
}

function compareTreeEntryFoundPath(left: TreeEntryFound, right: TreeEntryFound): number {
  const leftPath = left.path.value;
  const rightPath = right.path.value;
  if (leftPath < rightPath) {
    return -1;
  }
  if (leftPath > rightPath) {
    return 1;
  }
  return 0;
}

export default class InMemoryGraphAdapter extends GraphPersistencePort {
  private readonly _author: string;
  private readonly _clock: { now(): number };
  private readonly _hash: HashFn;
  private readonly _cryptoReady: Promise<void>;
  private readonly _commits = new Map<string, CommitRecord>();
  private readonly _blobs = new Map<string, Uint8Array>();
  private readonly _trees = new Map<string, TreeEntry[]>();
  private readonly _treeEntryIndexes = new Map<string, Map<string, TreeEntry>>();
  private readonly _refs = new Map<string, string>();
  private readonly _config = new Map<string, string>();

  constructor(options?: InMemoryAdapterOptions) {
    super();
    const opts = options ?? {};
    this._author = (opts.author !== undefined && opts.author.length > 0) ? opts.author : 'InMemory <inmemory@test>';
    this._clock = opts.clock ?? { now: () => Date.now() };
    this._hash = opts.hash ?? defaultHash;
    this._cryptoReady = initCryptoReady(opts.hash);
  }

  // -- TreePort -------------------------------------------------------------

  get emptyTree(): string {
    return EMPTY_TREE_OID;
  }

  async writeTree(entries: string[]): Promise<string> {
    await this._cryptoReady;
    const parsed = entries.map(line => parseMktreeEntry(line));
    const oid = hashTree(this._hash, parsed);
    this._trees.set(oid, parsed);
    this._treeEntryIndexes.set(oid, treeEntryIndex(parsed));
    return oid;
  }

  async readTreeOids(treeOid: string): Promise<Record<string, string>> {
    validateOid(treeOid);
    if (treeOid === EMPTY_TREE_OID) {
      return {};
    }
    const entries = this._trees.get(treeOid);
    if (entries === undefined) {
      throw new PersistenceError(`Tree not found: ${treeOid}`, PersistenceError.E_MISSING_OBJECT);
    }
    const result = new Map<string, string>();
    for (const e of entries) {
      result.set(e.path, e.oid);
    }
    return Object.fromEntries(result);
  }

  async readTreeEntryOid(treeOid: string, path: TreeEntryPath): Promise<TreeEntryProbeResult> {
    validateOid(treeOid);
    if (treeOid === EMPTY_TREE_OID) {
      return new TreeEntryMissing(path);
    }
    const entry = this._requireTreeEntryIndex(treeOid).get(path.value);
    if (entry !== undefined) {
      return new TreeEntryFound({ path, oid: entry.oid });
    }
    return new TreeEntryMissing(path);
  }

  async readTreeEntryPrefix(
    treeOid: string,
    prefix: TreeEntryPath,
    limit: TreeEntryLimit,
  ): Promise<TreeEntryPrefixBatch> {
    validateOid(treeOid);
    if (treeOid === EMPTY_TREE_OID) {
      return new TreeEntryPrefixBatch({ prefix, limit, entries: [] });
    }
    const entries = this._requireTreeEntries(treeOid);
    const matches: TreeEntryFound[] = [];
    const normalizedPrefix = prefix.withoutTrailingSlash();
    const childPrefix = `${normalizedPrefix.value}/`;
    for (const entry of entries) {
      if (entry.path.startsWith(childPrefix)) {
        matches.push(new TreeEntryFound({
          path: new TreeEntryPath(entry.path),
          oid: entry.oid,
        }));
      }
    }
    matches.sort(compareTreeEntryFoundPath);
    return new TreeEntryPrefixBatch({ prefix, limit, entries: matches.slice(0, limit.value) });
  }

  async readTree(treeOid: string): Promise<Record<string, Uint8Array>> {
    const oids = await this.readTreeOids(treeOid);
    const files = new Map<string, Uint8Array>();
    for (const [path, oid] of Object.entries(oids)) {
      files.set(path, await this.readBlob(oid));
    }
    return Object.fromEntries(files);
  }

  private _requireTreeEntries(treeOid: string): TreeEntry[] {
    const entries = this._trees.get(treeOid);
    if (entries === undefined) {
      throw new PersistenceError(`Tree not found: ${treeOid}`, PersistenceError.E_MISSING_OBJECT);
    }
    return entries;
  }

  private _requireTreeEntryIndex(treeOid: string): Map<string, TreeEntry> {
    const entryIndex = this._treeEntryIndexes.get(treeOid);
    if (entryIndex === undefined) {
      throw new PersistenceError(`Tree not found: ${treeOid}`, PersistenceError.E_MISSING_OBJECT);
    }
    return entryIndex;
  }

  // -- BlobPort -------------------------------------------------------------

  async writeBlob(content: Uint8Array | string): Promise<string> {
    await this._cryptoReady;
    const bytes = toBytes(content);
    const oid = hashBlob(this._hash, bytes);
    this._blobs.set(oid, bytes);
    return oid;
  }

  async readBlob(oid: string): Promise<Uint8Array> {
    validateOid(oid);
    const buf = this._blobs.get(oid);
    if (buf === undefined) {
      throw new PersistenceError(`Blob not found: ${oid}`, PersistenceError.E_MISSING_OBJECT);
    }
    return buf;
  }

  // -- CommitPort -----------------------------------------------------------

  async commitNode({ message, parents = [] }: CommitNodeOptions): Promise<string> {
    for (const p of parents) {
      validateOid(p);
    }
    return await this._createCommit(EMPTY_TREE_OID, parents, message);
  }

  async commitNodeWithTree({ treeOid, parents = [], message }: CommitNodeWithTreeOptions): Promise<string> {
    validateOid(treeOid);
    for (const p of parents) {
      validateOid(p);
    }
    return await this._createCommit(treeOid, parents, message);
  }

  async showNode(sha: string): Promise<string> {
    validateOid(sha);
    const commit = this._commits.get(sha);
    if (commit === undefined) {
      throw new PersistenceError(`Commit not found: ${sha}`, PersistenceError.E_MISSING_OBJECT);
    }
    return commit.message;
  }

  async getNodeInfo(sha: string): Promise<NodeInfo> {
    validateOid(sha);
    const commit = this._commits.get(sha);
    if (commit === undefined) {
      throw new PersistenceError(`Commit not found: ${sha}`, PersistenceError.E_MISSING_OBJECT);
    }
    return {
      sha,
      message: commit.message,
      author: commit.author,
      date: commit.date,
      parents: [...commit.parents],
    };
  }

  async getCommitTree(sha: string): Promise<string> {
    validateOid(sha);
    const commit = this._commits.get(sha);
    if (commit === undefined) {
      throw new PersistenceError(`Commit not found: ${sha}`, PersistenceError.E_MISSING_OBJECT);
    }
    return commit.treeOid;
  }

  async nodeExists(sha: string): Promise<boolean> {
    validateOid(sha);
    return this._commits.has(sha);
  }

  async countNodes(ref: string): Promise<number> {
    validateRef(ref);
    const tip = this._resolveRef(ref);
    if (tip === null) {
      throw new PersistenceError(`Ref not found: ${ref}`, PersistenceError.E_REF_NOT_FOUND);
    }
    return this._countReachable(tip);
  }

  async logNodes({ ref, limit = 50, format: _format }: LogNodesOptions): Promise<string> {
    validateRef(ref);
    validateLimit(limit);
    const records = this._walkLog(ref, limit);
    if (typeof _format !== 'string' || _format.length === 0) {
      return records.map(c =>
        `commit ${c.sha}\nAuthor: ${c.author}\nDate:   ${c.date}\n\n    ${c.message}\n`,
      ).join('\n');
    }
    return records.map(c => this._formatCommitRecord(c)).join('\0') + (records.length > 0 ? '\0' : '');
  }

  async logNodesStream({ ref, limit = 1000000, format: _format }: LogNodesOptions): Promise<WarpStream<CommitLogChunk>> {
    validateRef(ref);
    validateLimit(limit);
    const records = this._walkLog(ref, limit);
    const formatted = records.map(c => this._formatCommitRecord(c)).join('\0') + (records.length > 0 ? '\0' : '');
    return WarpStream.of<CommitLogChunk>(formatted);
  }

  async ping(): Promise<PingResult> {
    return { ok: true, latencyMs: 0 };
  }

  // -- RefPort --------------------------------------------------------------

  async updateRef(ref: string, oid: string): Promise<void> {
    validateRef(ref);
    validateOid(oid);
    this._refs.set(ref, oid);
  }

  async readRef(ref: string): Promise<string | null> {
    validateRef(ref);
    return this._refs.get(ref) ?? null;
  }

  async deleteRef(ref: string): Promise<void> {
    validateRef(ref);
    this._refs.delete(ref);
  }

  async compareAndSwapRef(ref: string, newOid: string, expectedOid: string | null): Promise<void> {
    validateRef(ref);
    validateOid(newOid);
    if (typeof expectedOid === 'string' && expectedOid.length > 0) {
      validateOid(expectedOid);
    }
    const current = this._refs.get(ref) ?? null;
    if (current !== expectedOid) {
      const display = (v: string | null): string => (typeof v === 'string' && v.length > 0 ? v : '(none)');
      throw new PersistenceError(
        `CAS mismatch on ${ref}: expected ${display(expectedOid)}, got ${display(current)}`,
        PersistenceError.E_REF_IO,
      );
    }
    this._refs.set(ref, newOid);
  }

  async listRefs(prefix: string, options?: ListRefsOptions): Promise<string[]> {
    validateRef(prefix);
    const sorted = this._filterRefsByPrefix(prefix);
    const limit = options?.limit;
    if (typeof limit === 'number' && limit > 0) {
      validateLimit(limit);
      return sorted.slice(0, limit);
    }
    return sorted;
  }

  // -- ConfigPort -----------------------------------------------------------

  async configGet(key: string): Promise<string | null> {
    validateConfigKey(key);
    return this._config.get(key) ?? null;
  }

  async configSet(key: string, value: string): Promise<void> {
    validateConfigKey(key);
    if (typeof value !== 'string') {
      throw new WarpError('Config value must be a string', 'E_INVALID_INPUT');
    }
    this._config.set(key, value);
  }

  // -- Private helpers ------------------------------------------------------

  private _filterRefsByPrefix(prefix: string): string[] {
    const result: string[] = [];
    for (const key of this._refs.keys()) {
      if (key.startsWith(prefix)) {
        result.push(key);
      }
    }
    return result.sort();
  }

  private async _createCommit(treeOid: string, parents: string[], message: string): Promise<string> {
    await this._cryptoReady;
    const date = new Date(this._clock.now()).toISOString();
    const sha = hashCommit(this._hash, { treeOid, parents, message, author: this._author, date });
    this._commits.set(sha, { treeOid, parents: [...parents], message, author: this._author, date });
    return sha;
  }

  private _resolveRef(ref: string): string | null {
    const fromRefs = this._refs.get(ref);
    if (fromRefs !== undefined) {
      return fromRefs;
    }
    if (this._commits.has(ref)) {
      return ref;
    }
    return null;
  }

  private _walkLog(ref: string, limit: number): (CommitRecord & { sha: string })[] {
    const tip = this._resolveRef(ref);
    if (tip === null) {
      return [];
    }
    const all = this._collectCommits(tip);
    all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return all.slice(0, limit);
  }

  private _countReachable(startSha: string): number {
    const visited = new Set<string>();
    let count = 0;
    const stack = [startSha];
    while (stack.length > 0) {
      const sha = stack.pop()!;
      if (visited.has(sha)) {
        continue;
      }
      visited.add(sha);
      const commit = this._commits.get(sha);
      if (commit !== undefined) {
        count++;
        for (const p of commit.parents) {
          stack.push(p);
        }
      }
    }
    return count;
  }

  private _collectCommits(startSha: string): (CommitRecord & { sha: string })[] {
    const all: (CommitRecord & { sha: string })[] = [];
    const visited = new Set<string>();
    const queue = [startSha];
    let head = 0;
    while (head < queue.length) {
      const sha = queue[head++]!;
      if (visited.has(sha)) {
        continue;
      }
      visited.add(sha);
      const commit = this._commits.get(sha);
      if (commit !== undefined) {
        all.push({ sha, ...commit });
        for (const p of commit.parents) {
          if (!visited.has(p)) {
            queue.push(p);
          }
        }
      }
    }
    return all;
  }

  private _formatCommitRecord(c: CommitRecord & { sha: string }): string {
    return `${c.sha}\n${c.author}\n${c.date}\n${c.parents.join(' ')}\n${c.message}`;
  }
}
