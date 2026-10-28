import ConeRecordError from '../../domain/errors/ConeRecordError.ts';
import ConeBasis from '../../domain/services/cone/ConeBasis.ts';
import type ConeBasisHead from '../../domain/services/cone/ConeBasisHead.ts';
import type { ConeRecord } from '../../domain/services/cone/ConeRecord.ts';
import type ConeRecordKey from '../../domain/services/cone/ConeRecordKey.ts';
import ConeRecordSnapshot from '../../domain/services/cone/ConeRecordSnapshot.ts';
import ConeRoot from '../../domain/services/cone/ConeRoot.ts';
import StoredConeBasis from '../../domain/services/cone/StoredConeBasis.ts';
import TreeEntryFound from '../../domain/tree/TreeEntryFound.ts';
import TreeEntryLimit from '../../domain/tree/TreeEntryLimit.ts';
import TreeEntryPath from '../../domain/tree/TreeEntryPath.ts';
import type TreeEntryPrefixBatch from '../../domain/tree/TreeEntryPrefixBatch.ts';
import type { TreeEntryProbeResult } from '../../domain/tree/TreeEntryProbeResult.ts';
import { buildConeRetainedRef } from '../../domain/utils/ConeRefLayout.ts';
import { compareStrings } from '../../domain/utils/StringComparison.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import ConeRecordStorePort from '../../ports/ConeRecordStorePort.ts';
import ConeFrontierCborCodec from './ConeFrontierCborCodec.ts';
import ConeRecordCborCodec from './ConeRecordCborCodec.ts';

/** The history surface the trie needs: blobs, trees, tree probes and ref compare-and-swap. */
export type ConeTrieHistory = {
  readBlob(oid: string): Promise<Uint8Array>;
  writeBlob(content: Uint8Array | string): Promise<string>;
  writeTree(entries: string[]): Promise<string>;
  readTreeEntryOid(treeOid: string, path: TreeEntryPath): Promise<TreeEntryProbeResult>;
  readTreeEntryPrefix(treeOid: string, prefix: TreeEntryPath, limit: TreeEntryLimit): Promise<TreeEntryPrefixBatch>;
  readRef(ref: string): Promise<string | null>;
  compareAndSwapRef(ref: string, newOid: string, expectedOid: string | null): Promise<void>;
  deleteRef(ref: string): Promise<void>;
};

type DirectoryEdit = { readonly blobs: Map<string, string>; readonly dirs: Map<string, DirectoryEdit> };

const FAMILY_DIRECTORIES = Object.freeze({ node: 'n', edge: 'e', dot: 'd', adjacency: 'a' });
const ROOT_DIRECTORIES = Object.freeze(Object.values(FAMILY_DIRECTORIES));
/** Root, family and first prefix level hold trees; the second prefix level holds record blobs. */
const RECORD_DIRECTORY_DEPTH = 3;
const LIST_LIMIT = new TreeEntryLimit(Number.MAX_SAFE_INTEGER);
const FRONTIER_ENTRY = 'frontier';
const RECORDS_ENTRY = 'records';
/** Captured bases a clone keeps reachable under its retained ref, most recent first to survive. */
export const CONE_RETAINED_BASES = 64;
const RETAINED_DIRECTORY = 'r';
const RETAINED_SEQUENCE_DIGITS = 12;
const RETAIN_ATTEMPTS = 4;

type RetainedEntry = { readonly sequence: number; readonly revision: string };

/**
 * Stores cone records as a Git tree trie: `<family>/<r0r1>/<r2r3>/<route>`,
 * where `route` is the record key's BLAKE3 route (hex). Two prefix levels of
 * 256 keep every directory small, and writing records rewrites only the
 * blobs and directories on their paths; every other subtree is shared.
 *
 * A basis head (`refs/warp/<lane>/cone/head`, or a strand's
 * `cone/strands/<id>/base` and `cone/strands/<id>/head`) points at a tree
 * holding the `frontier` blob and, once anything is folded, the `records`
 * trie. `refs/warp/<lane>/cone/retained` points at a tree whose `r/`
 * directory names the last {@link CONE_RETAINED_BASES} captured basis trees,
 * keeping them reachable through `git gc`. All of them are clone-local
 * derived state and never transferred.
 */
export default class GitConeRecordStoreAdapter extends ConeRecordStorePort {
  readonly #history: ConeTrieHistory;
  readonly #records: ConeRecordCborCodec;
  readonly #frontiers: ConeFrontierCborCodec;

  constructor(options: { readonly history: ConeTrieHistory; readonly codec: CodecPort }) {
    super();
    this.#history = options.history;
    this.#records = new ConeRecordCborCodec(options.codec);
    this.#frontiers = new ConeFrontierCborCodec(options.codec);
  }

  override async readRecords(root: ConeRoot, keys: readonly ConeRecordKey[]): Promise<ConeRecordSnapshot> {
    if (root.isEmpty()) {
      return ConeRecordSnapshot.empty();
    }
    const records: ConeRecord[] = [];
    for (const key of uniqueKeys(keys)) {
      const record = await this.#readRecord(root.revision(), key);
      if (record !== null) {
        records.push(record);
      }
    }
    return new ConeRecordSnapshot(records);
  }

  override async writeRecords(root: ConeRoot, records: readonly ConeRecord[]): Promise<ConeRoot> {
    if (records.length === 0) {
      return root;
    }
    const edit = emptyEdit();
    for (const record of records) {
      insertBlob(edit, record.key(), await this.#history.writeBlob(this.#records.encode(record)));
    }
    return ConeRoot.at(await this.#writeDirectory(root, { path: '', depth: 0, edit }));
  }

  override async readBasis(head: ConeBasisHead): Promise<StoredConeBasis | null> {
    const revision = await this.#history.readRef(head.ref());
    if (revision === null) {
      return null;
    }
    const frontier = await this.#history.readTreeEntryOid(revision, new TreeEntryPath(FRONTIER_ENTRY));
    if (!(frontier instanceof TreeEntryFound)) {
      throw new ConeRecordError('Cone basis head has no frontier', { code: 'E_CONE_RECORD_CORRUPT', context: { ref: head.ref() } });
    }
    const records = await this.#history.readTreeEntryOid(revision, new TreeEntryPath(RECORDS_ENTRY));
    const root = records instanceof TreeEntryFound ? ConeRoot.at(records.oid) : ConeRoot.empty();
    const basis = new ConeBasis(root, this.#frontiers.decode(await this.#history.readBlob(frontier.oid)));
    return new StoredConeBasis(basis, revision);
  }

  override async publishBasis(
    head: ConeBasisHead,
    basis: ConeBasis,
    expected: StoredConeBasis | null,
  ): Promise<StoredConeBasis | null> {
    const revision = await this.#writeBasisTree(basis);
    const expectedRevision = expected === null ? null : expected.revision;
    if (revision === expectedRevision) {
      return new StoredConeBasis(basis, revision);
    }
    return await this.#swapRef(head.ref(), revision, expectedRevision) ? new StoredConeBasis(basis, revision) : null;
  }

  override async retainBasis(lane: string, stored: StoredConeBasis): Promise<void> {
    const ref = buildConeRetainedRef(lane);
    for (let attempt = 0; attempt < RETAIN_ATTEMPTS; attempt += 1) {
      if (await this.#retainOnce(ref, stored.revision)) {
        return;
      }
    }
    throw new ConeRecordError('Retaining a captured cone basis kept losing to concurrent captures', {
      code: 'E_CONE_RETAIN_CONTENDED', context: { lane, attempts: RETAIN_ATTEMPTS },
    });
  }

  override async dropBasis(head: ConeBasisHead): Promise<void> {
    if (await this.#history.readRef(head.ref()) !== null) {
      await this.#history.deleteRef(head.ref());
    }
  }

  /** Adds `revision` to the retained bases unless it is there; false when another capture moved the ref first. */
  async #retainOnce(ref: string, revision: string): Promise<boolean> {
    const current = await this.#history.readRef(ref);
    const entries = current === null ? [] : await this.#retainedEntries(current);
    if (entries.some((entry) => entry.revision === revision)) {
      return true;
    }
    const sequence = (entries[entries.length - 1]?.sequence ?? 0) + 1;
    const next = [...entries, { sequence, revision }].slice(-CONE_RETAINED_BASES);
    return await this.#swapRef(ref, await this.#writeRetainedTree(next), current);
  }

  /** The retained bases under a retained-ref tree, oldest first. */
  async #retainedEntries(treeOid: string): Promise<RetainedEntry[]> {
    const batch = await this.#history.readTreeEntryPrefix(treeOid, new TreeEntryPath(RETAINED_DIRECTORY), LIST_LIMIT);
    return batch.entries
      .map((entry) => retainedEntry(entry.path.value.slice(RETAINED_DIRECTORY.length + 1), entry.oid))
      .sort((left, right) => left.sequence - right.sequence);
  }

  async #writeRetainedTree(entries: readonly RetainedEntry[]): Promise<string> {
    const lines = entries.map((entry) => `040000 tree ${entry.revision}\t${retainedName(entry.sequence, entry.revision)}`);
    const directory = await this.#history.writeTree(lines.sort());
    return await this.#history.writeTree([`040000 tree ${directory}\t${RETAINED_DIRECTORY}`]);
  }

  /** Compare-and-swaps `ref`; false when another writer moved it first. */
  async #swapRef(ref: string, newOid: string, expectedOid: string | null): Promise<boolean> {
    try {
      await this.#history.compareAndSwapRef(ref, newOid, expectedOid);
      return true;
    } catch (error) {
      if (await this.#history.readRef(ref) !== expectedOid) {
        return false;
      }
      throw error;
    }
  }

  async #readRecord(rootRevision: string, key: ConeRecordKey): Promise<ConeRecord | null> {
    const entry = await this.#history.readTreeEntryOid(rootRevision, new TreeEntryPath(recordPath(key)));
    if (!(entry instanceof TreeEntryFound)) {
      return null;
    }
    const record = this.#records.decode(await this.#history.readBlob(entry.oid));
    if (!record.key().equals(key)) {
      throw new ConeRecordError('Stored cone record does not match its trie path', {
        code: 'E_CONE_RECORD_CORRUPT',
        context: { key: key.toString() },
      });
    }
    return record;
  }

  async #writeBasisTree(basis: ConeBasis): Promise<string> {
    const frontier = await this.#history.writeBlob(this.#frontiers.encode(basis.frontier));
    const entries = [`100644 blob ${frontier}\t${FRONTIER_ENTRY}`];
    if (!basis.root.isEmpty()) {
      entries.push(`040000 tree ${basis.root.revision()}\t${RECORDS_ENTRY}`);
    }
    return await this.#history.writeTree(entries.sort());
  }

  async #writeDirectory(
    root: ConeRoot,
    directory: { readonly path: string; readonly depth: number; readonly edit: DirectoryEdit },
  ): Promise<string> {
    const entries = await this.#listDirectory(root, directory);
    for (const [name, child] of directory.edit.dirs) {
      const path = directory.path === '' ? name : `${directory.path}/${name}`;
      const oid = await this.#writeDirectory(root, { path, depth: directory.depth + 1, edit: child });
      entries.set(name, `040000 tree ${oid}\t${name}`);
    }
    for (const [name, oid] of directory.edit.blobs) {
      entries.set(name, `100644 blob ${oid}\t${name}`);
    }
    return await this.#history.writeTree([...entries].sort(([left], [right]) => compareStrings(left, right)).map(([, line]) => line));
  }

  /** The current entries of one trie directory, as mktree lines by name. */
  async #listDirectory(root: ConeRoot, directory: { readonly path: string; readonly depth: number }): Promise<Map<string, string>> {
    if (root.isEmpty()) {
      return new Map();
    }
    const found = directory.path === ''
      ? await this.#rootEntries(root.revision())
      : (await this.#history.readTreeEntryPrefix(root.revision(), new TreeEntryPath(directory.path), LIST_LIMIT)).entries;
    const mode = directory.depth < RECORD_DIRECTORY_DEPTH ? '040000 tree' : '100644 blob';
    return new Map(found.map((entry) => {
      const name = entry.path.value.slice(entry.path.value.lastIndexOf('/') + 1);
      return [name, `${mode} ${entry.oid}\t${name}`];
    }));
  }

  async #rootEntries(rootRevision: string): Promise<TreeEntryFound[]> {
    const found: TreeEntryFound[] = [];
    for (const name of ROOT_DIRECTORIES) {
      const entry = await this.#history.readTreeEntryOid(rootRevision, new TreeEntryPath(name));
      if (entry instanceof TreeEntryFound) {
        found.push(entry);
      }
    }
    return found;
  }
}

/** The trie path of a record key. */
export function recordPath(key: ConeRecordKey): string {
  return [...recordDirectories(key), key.route].join('/');
}

function recordDirectories(key: ConeRecordKey): readonly string[] {
  return [FAMILY_DIRECTORIES[key.family], key.route.slice(0, 2), key.route.slice(2, 4)];
}

function retainedName(sequence: number, revision: string): string {
  return `${String(sequence).padStart(RETAINED_SEQUENCE_DIGITS, '0')}-${revision}`;
}

function retainedEntry(name: string, oid: string): RetainedEntry {
  const separator = name.indexOf('-');
  const sequence = Number(name.slice(0, separator));
  if (separator !== RETAINED_SEQUENCE_DIGITS || !Number.isSafeInteger(sequence) || name.slice(separator + 1) !== oid) {
    throw new ConeRecordError('Retained cone basis entry is malformed', { code: 'E_CONE_RECORD_CORRUPT', context: { name } });
  }
  return { sequence, revision: oid };
}

function uniqueKeys(keys: readonly ConeRecordKey[]): ConeRecordKey[] {
  return [...new Map(keys.map((key) => [key.toString(), key])).values()];
}

function emptyEdit(): DirectoryEdit {
  return { blobs: new Map(), dirs: new Map() };
}

function insertBlob(edit: DirectoryEdit, key: ConeRecordKey, oid: string): void {
  let directory = edit;
  for (const name of recordDirectories(key)) {
    const child = directory.dirs.get(name) ?? emptyEdit();
    directory.dirs.set(name, child);
    directory = child;
  }
  directory.blobs.set(key.route, oid);
}
