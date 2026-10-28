import type ConeRecordStorePort from '../../../ports/ConeRecordStorePort.ts';
import type { ConeRecord } from './ConeRecord.ts';
import type ConeRecordKey from './ConeRecordKey.ts';
import ConeRecordSnapshot from './ConeRecordSnapshot.ts';
import type ConeRoot from './ConeRoot.ts';

/** Staged records a session holds before writing them through to the trie. */
export const CONE_SESSION_FLUSH_RECORDS = 4096;

/**
 * A run of folds over one record trie.
 *
 * Reads go to records already read or staged in this session first and to
 * the store only for the rest, so a record touched by many patches of one
 * ingest is read once. Staged records are written in one trie update; a
 * session that stages more than `flushRecords` writes them through early so
 * its memory stays bounded however long the run of patches is.
 */
export default class ConeFoldSession {
  readonly #store: ConeRecordStorePort;
  readonly #flushRecords: number;
  readonly #known = new Map<string, ConeRecord | null>();
  readonly #staged = new Map<string, ConeRecord>();
  #root: ConeRoot;

  constructor(options: { readonly store: ConeRecordStorePort; readonly root: ConeRoot; readonly flushRecords?: number }) {
    this.#store = options.store;
    this.#root = options.root;
    this.#flushRecords = options.flushRecords ?? CONE_SESSION_FLUSH_RECORDS;
  }

  /** The records at `keys`, as this session currently sees them. */
  async read(keys: readonly ConeRecordKey[]): Promise<ConeRecordSnapshot> {
    const missing = keys.filter((key) => !this.#known.has(key.toString()));
    if (missing.length > 0) {
      const loaded = await this.#store.readRecords(this.#root, missing);
      for (const key of missing) {
        this.#known.set(key.toString(), loaded.get(key));
      }
    }
    return new ConeRecordSnapshot(keys.flatMap((key) => {
      const record = this.#known.get(key.toString()) ?? null;
      return record === null ? [] : [record];
    }));
  }

  /** Stages changed records; later reads in this session see them. */
  async stage(records: readonly ConeRecord[]): Promise<void> {
    for (const record of records) {
      const key = record.key().toString();
      this.#known.set(key, record);
      this.#staged.set(key, record);
    }
    if (this.#staged.size >= this.#flushRecords) {
      await this.#flush();
    }
  }

  /** Writes every staged record and returns the resulting root. */
  async commit(): Promise<ConeRoot> {
    await this.#flush();
    return this.#root;
  }

  async #flush(): Promise<void> {
    if (this.#staged.size === 0) {
      return;
    }
    this.#root = await this.#store.writeRecords(this.#root, [...this.#staged.values()]);
    this.#staged.clear();
    this.#known.clear();
  }
}
