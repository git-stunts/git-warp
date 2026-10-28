import ConeRecordError from '../../domain/errors/ConeRecordError.ts';
import ConeBasis from '../../domain/services/cone/ConeBasis.ts';
import type { ConeRecord } from '../../domain/services/cone/ConeRecord.ts';
import type ConeRecordKey from '../../domain/services/cone/ConeRecordKey.ts';
import ConeRecordSnapshot from '../../domain/services/cone/ConeRecordSnapshot.ts';
import ConeRoot from '../../domain/services/cone/ConeRoot.ts';
import StoredConeBasis from '../../domain/services/cone/StoredConeBasis.ts';
import { textDecode, textEncode } from '../../domain/utils/bytes.ts';
import { buildConeHeadRef } from '../../domain/utils/RefLayout.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import ConeRecordStorePort from '../../ports/ConeRecordStorePort.ts';
import ConeFrontierCborCodec from './ConeFrontierCborCodec.ts';
import ConeRecordCborCodec from './ConeRecordCborCodec.ts';
import GitConeRecordTrie from './GitConeRecordTrie.ts';
import GitFastImportTreeScript from './GitFastImportTreeScript.ts';
import GitFastImportTreeWriter from './GitFastImportTreeWriter.ts';
import type { GitPlumbing } from './gitErrorClassification.ts';
import type { GitTreeObjectEntry } from './GitTreeObjectEntry.ts';

/** The history surface the trie needs: session-backed object reads, fast-import and ref compare-and-swap. */
export type ConeTrieHistory = {
  readonly plumbing: Pick<GitPlumbing, 'execute'>;
  readBlob(oid: string): Promise<Uint8Array>;
  readTreeObjectEntries(treeOid: string): Promise<readonly GitTreeObjectEntry[]>;
  readRef(ref: string): Promise<string | null>;
  compareAndSwapRef(ref: string, newOid: string, expectedOid: string | null): Promise<void>;
};

const FAMILY_DIRECTORIES = Object.freeze({ node: 'n', edge: 'e', dot: 'd', adjacency: 'a' });
const ROOT_DIRECTORIES: ReadonlySet<string> = new Set(Object.values(FAMILY_DIRECTORIES));
const FRONTIER_ENTRY = 'frontier';
const LAYOUT_ENTRY = 'layout';
const RECORDS_ENTRY = 'records';
/**
 * The trie layout this adapter reads and writes, stored in every basis head.
 * Layout 1 (slice 1, unmarked) used two fixed 256-way levels.
 */
export const CONE_TRIE_LAYOUT = 'git-warp cone record trie\nlayout 2: 16-way route digits, buckets of 32 records\n';

/**
 * Stores cone records as a Git tree trie (layout 2). The records root holds
 * one directory per family (`n`, `e`, `d`, `a`); each is an adaptive 16-way
 * trie on the record key's BLAKE3 route (`GitConeRecordTrie`), with record
 * blobs named by their full route.
 *
 * Reads walk cached tree objects and read blobs through the history's
 * long-lived object session, so they start no Git process. A write of any
 * number of records is one `git fast-import` process that writes the new
 * blobs and every changed directory once; untouched subtrees are shared.
 *
 * The basis head `refs/warp/<lane>/cone/head` points at a tree of the
 * `frontier` blob, the `layout` marker blob and, once anything is folded,
 * the `records` trie. A head with another layout or none is refused. It is
 * clone-local derived state and never transferred.
 */
export default class GitConeRecordStoreAdapter extends ConeRecordStorePort {
  readonly #history: ConeTrieHistory;
  readonly #records: ConeRecordCborCodec;
  readonly #frontiers: ConeFrontierCborCodec;
  readonly #trie: GitConeRecordTrie;
  readonly #writer: GitFastImportTreeWriter;
  /** Layout blobs already read and found to be this adapter's layout. */
  readonly #knownLayouts = new Set<string>();

  constructor(options: { readonly history: ConeTrieHistory; readonly codec: CodecPort }) {
    super();
    this.#history = options.history;
    this.#records = new ConeRecordCborCodec(options.codec);
    this.#frontiers = new ConeFrontierCborCodec(options.codec);
    this.#trie = new GitConeRecordTrie(async (treeOid) => await this.#history.readTreeObjectEntries(treeOid));
    this.#writer = new GitFastImportTreeWriter({ plumbing: options.history.plumbing });
  }

  override async readRecords(root: ConeRoot, keys: readonly ConeRecordKey[]): Promise<ConeRecordSnapshot> {
    const families = await this.#familiesOf(root);
    const records: ConeRecord[] = [];
    for (const key of uniqueKeys(keys)) {
      const family = families.get(FAMILY_DIRECTORIES[key.family]);
      const blob = family === undefined ? null : await this.#trie.locate(family, key.route);
      if (blob !== null) {
        records.push(this.#decodeRecord(await this.#history.readBlob(blob), key));
      }
    }
    return new ConeRecordSnapshot(records);
  }

  override async writeRecords(root: ConeRoot, records: readonly ConeRecord[]): Promise<ConeRoot> {
    if (records.length === 0) {
      return root;
    }
    const script = await this.#placementScript(await this.#familiesOf(root), records);
    return ConeRoot.at(await this.#writer.write(script));
  }

  override async readBasis(lane: string): Promise<StoredConeBasis | null> {
    const revision = await this.#history.readRef(buildConeHeadRef(lane));
    if (revision === null) {
      return null;
    }
    const entries = new Map((await this.#history.readTreeObjectEntries(revision)).map((entry) => [entry.name, entry]));
    await this.#requireLayout(lane, entries.get(LAYOUT_ENTRY));
    const frontier = entries.get(FRONTIER_ENTRY);
    if (frontier === undefined) {
      throw new ConeRecordError('Cone basis head has no frontier', { code: 'E_CONE_RECORD_CORRUPT', context: { lane } });
    }
    const basis = new ConeBasis(recordsRoot(entries.get(RECORDS_ENTRY)), this.#frontiers.decode(await this.#history.readBlob(frontier.oid)));
    return new StoredConeBasis(basis, revision);
  }

  override async publishBasis(
    lane: string,
    basis: ConeBasis,
    expected: StoredConeBasis | null,
  ): Promise<StoredConeBasis | null> {
    const revision = await this.#writeBasisTree(basis);
    const expectedRevision = expected === null ? null : expected.revision;
    if (revision === expectedRevision) {
      return new StoredConeBasis(basis, revision);
    }
    const ref = buildConeHeadRef(lane);
    try {
      await this.#history.compareAndSwapRef(ref, revision, expectedRevision);
    } catch (error) {
      if (await this.#history.readRef(ref) !== expectedRevision) {
        return null;
      }
      throw error;
    }
    return new StoredConeBasis(basis, revision);
  }

  /** The family directories of a records root, by name; the empty root has none. */
  async #familiesOf(root: ConeRoot): Promise<Map<string, string>> {
    const families = new Map<string, string>();
    const entries = root.isEmpty() ? [] : await this.#history.readTreeObjectEntries(root.revision());
    for (const entry of entries) {
      if (!ROOT_DIRECTORIES.has(entry.name) || entry.type !== 'tree') {
        throw new ConeRecordError(`Cone records root holds an unknown entry ${entry.name}`, {
          code: 'E_CONE_RECORD_CORRUPT',
          context: { root: root.revision(), name: entry.name },
        });
      }
      families.set(entry.name, entry.oid);
    }
    return families;
  }

  /** A fast-import program that grafts the current families and places `records` into them. */
  async #placementScript(families: ReadonlyMap<string, string>, records: readonly ConeRecord[]): Promise<GitFastImportTreeScript> {
    const script = new GitFastImportTreeScript();
    for (const [name, treeOid] of families) {
      script.graft(name, treeOid);
    }
    for (const [name, placed] of byFamily(records, this.#records)) {
      await this.#trie.place(script, { path: name, treeOid: families.get(name) ?? null }, placed);
    }
    return script;
  }

  #decodeRecord(bytes: Uint8Array, key: ConeRecordKey): ConeRecord {
    const record = this.#records.decode(bytes);
    if (!record.key().equals(key)) {
      throw new ConeRecordError('Stored cone record does not match its trie path', {
        code: 'E_CONE_RECORD_CORRUPT',
        context: { key: key.toString() },
      });
    }
    return record;
  }

  async #requireLayout(lane: string, layout: GitTreeObjectEntry | undefined): Promise<void> {
    if (layout === undefined) {
      throw layoutUnsupported(lane, null);
    }
    if (this.#knownLayouts.has(layout.oid)) {
      return;
    }
    const marker = textDecode(await this.#history.readBlob(layout.oid));
    if (marker !== CONE_TRIE_LAYOUT) {
      throw layoutUnsupported(lane, marker);
    }
    this.#knownLayouts.add(layout.oid);
  }

  async #writeBasisTree(basis: ConeBasis): Promise<string> {
    const script = new GitFastImportTreeScript();
    script.write(FRONTIER_ENTRY, this.#frontiers.encode(basis.frontier));
    script.write(LAYOUT_ENTRY, textEncode(CONE_TRIE_LAYOUT));
    if (!basis.root.isEmpty()) {
      script.graft(RECORDS_ENTRY, basis.root.revision());
    }
    return await this.#writer.write(script);
  }
}

/** Encoded records grouped by family directory, by route; a later record of the same key wins. */
function byFamily(records: readonly ConeRecord[], codec: ConeRecordCborCodec): Map<string, Map<string, Uint8Array>> {
  const families = new Map<string, Map<string, Uint8Array>>();
  for (const record of records) {
    const key = record.key();
    const name = FAMILY_DIRECTORIES[key.family];
    const family = families.get(name) ?? new Map<string, Uint8Array>();
    family.set(key.route, codec.encode(record));
    families.set(name, family);
  }
  return families;
}

/** The records root a basis head names, or the empty root before anything is folded. */
function recordsRoot(entry: GitTreeObjectEntry | undefined): ConeRoot {
  return entry === undefined ? ConeRoot.empty() : ConeRoot.at(entry.oid);
}

function layoutUnsupported(lane: string, marker: string | null): ConeRecordError {
  return new ConeRecordError(
    `Cone basis head of lane ${lane} uses a record trie layout this version does not read; `
    + `delete ${buildConeHeadRef(lane)} to rebuild it from the writer chains`,
    { code: 'E_CONE_LAYOUT_UNSUPPORTED', context: { lane, layout: marker ?? '(unmarked)' } },
  );
}

function uniqueKeys(keys: readonly ConeRecordKey[]): ConeRecordKey[] {
  return [...new Map(keys.map((key) => [key.toString(), key])).values()];
}
