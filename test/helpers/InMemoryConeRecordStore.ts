import ConeBasis from '../../src/domain/services/cone/ConeBasis.ts';
import type ConeBasisHead from '../../src/domain/services/cone/ConeBasisHead.ts';
import type { ConeRecord } from '../../src/domain/services/cone/ConeRecord.ts';
import type ConeRecordKey from '../../src/domain/services/cone/ConeRecordKey.ts';
import ConeRecordSnapshot from '../../src/domain/services/cone/ConeRecordSnapshot.ts';
import ConeRoot from '../../src/domain/services/cone/ConeRoot.ts';
import StoredConeBasis from '../../src/domain/services/cone/StoredConeBasis.ts';
import ConeRecordStorePort from '../../src/ports/ConeRecordStorePort.ts';

/**
 * Immutable in-memory cone record trie for tests: every write yields a new
 * root that shares nothing mutable with the old one, and the basis head is
 * published by compare-and-swap. Counters let tests assert boundedness.
 */
export default class InMemoryConeRecordStore extends ConeRecordStorePort {
  readonly #roots = new Map<string, ReadonlyMap<string, ConeRecord>>();
  readonly #heads = new Map<string, StoredConeBasis>();
  readonly #retained = new Map<string, StoredConeBasis[]>();
  #revisions = 0;
  recordReads = 0;
  recordWrites = 0;
  /** Called before a publication compares the head, so tests can race it. */
  beforePublish: ((head: ConeBasisHead) => Promise<void>) | null = null;

  override async readRecords(root: ConeRoot, keys: readonly ConeRecordKey[]): Promise<ConeRecordSnapshot> {
    const records = this.#records(root);
    this.recordReads += keys.length;
    return new ConeRecordSnapshot(keys.flatMap((key) => {
      const record = records.get(key.toString());
      return record === undefined ? [] : [record];
    }));
  }

  override async writeRecords(root: ConeRoot, records: readonly ConeRecord[]): Promise<ConeRoot> {
    const next = new Map(this.#records(root));
    for (const record of records) {
      next.set(record.key().toString(), record);
    }
    this.recordWrites += records.length;
    return this.#root(next);
  }

  override async readBasis(head: ConeBasisHead): Promise<StoredConeBasis | null> {
    return this.#heads.get(head.ref()) ?? null;
  }

  override async publishBasis(head: ConeBasisHead, basis: ConeBasis, expected: StoredConeBasis | null): Promise<StoredConeBasis | null> {
    if (this.beforePublish !== null) {
      await this.beforePublish(head);
    }
    const current = this.#heads.get(head.ref()) ?? null;
    if (current !== expected) {
      return null;
    }
    const stored = new StoredConeBasis(basis, this.#nextRevision());
    this.#heads.set(head.ref(), stored);
    return stored;
  }

  override async retainBasis(lane: string, stored: StoredConeBasis): Promise<void> {
    const retained = this.#retained.get(lane) ?? [];
    if (!retained.includes(stored)) {
      retained.push(stored);
    }
    this.#retained.set(lane, retained);
  }

  override async readRetainedBases(lane: string): Promise<readonly StoredConeBasis[]> {
    return [...(this.#retained.get(lane) ?? [])];
  }

  override async dropBasis(head: ConeBasisHead): Promise<void> {
    this.#heads.delete(head.ref());
  }

  /** The bases retained for `lane`, in capture order. */
  retained(lane: string): readonly StoredConeBasis[] {
    return this.#retained.get(lane) ?? [];
  }

  /** Every record under `root`, for whole-trie assertions in tests. */
  allRecords(root: ConeRoot): readonly ConeRecord[] {
    return [...this.#records(root).values()];
  }

  /** Publishes a basis directly, as another clone process would. */
  forceHead(head: ConeBasisHead, basis: ConeBasis = ConeBasis.empty()): StoredConeBasis {
    const stored = new StoredConeBasis(basis, this.#nextRevision());
    this.#heads.set(head.ref(), stored);
    return stored;
  }

  #records(root: ConeRoot): ReadonlyMap<string, ConeRecord> {
    if (root.isEmpty()) {
      return new Map();
    }
    const records = this.#roots.get(root.revision());
    if (records === undefined) {
      throw new Error(`Unknown cone root ${root.revision()}`);
    }
    return records;
  }

  #root(records: ReadonlyMap<string, ConeRecord>): ConeRoot {
    const revision = this.#nextRevision();
    this.#roots.set(revision, records);
    return ConeRoot.at(revision);
  }

  #nextRevision(): string {
    this.#revisions += 1;
    return this.#revisions.toString(16).padStart(40, '0');
  }
}
