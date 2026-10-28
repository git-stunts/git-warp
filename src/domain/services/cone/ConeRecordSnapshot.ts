import ConeAdjacencyPage from './ConeAdjacencyPage.ts';
import ConeDotPage from './ConeDotPage.ts';
import ConeEdgeRecord from './ConeEdgeRecord.ts';
import ConeNodeRecord from './ConeNodeRecord.ts';
import type { ConeRecord } from './ConeRecord.ts';
import ConeRecordKey, { type ConeDirection, type ConeDotSet } from './ConeRecordKey.ts';

type RecordClass<T extends ConeRecord> = abstract new (...args: never[]) => T;

/**
 * Records loaded from a cone record trie, by key. An absent record reads as
 * the empty record of its identity, which is exactly what the join rules
 * see for an element no operation has named.
 */
export default class ConeRecordSnapshot {
  readonly #records: ReadonlyMap<string, ConeRecord>;

  constructor(records: Iterable<ConeRecord>) {
    const byKey = new Map<string, ConeRecord>();
    for (const record of records) {
      byKey.set(record.key().toString(), record);
    }
    this.#records = byKey;
    Object.freeze(this);
  }

  static empty(): ConeRecordSnapshot {
    return new ConeRecordSnapshot([]);
  }

  /** The stored record at `key`, or null when none is stored. */
  get(key: ConeRecordKey): ConeRecord | null {
    return this.#records.get(key.toString()) ?? null;
  }

  node(nodeId: string): ConeNodeRecord {
    return this.#typed(ConeRecordKey.forNode(nodeId), ConeNodeRecord) ?? ConeNodeRecord.empty(nodeId);
  }

  /** The stored edge record, or null when the edge has never been named. */
  storedEdge(edgeKey: string): ConeEdgeRecord | null {
    return this.#typed(ConeRecordKey.forEdge(edgeKey), ConeEdgeRecord);
  }

  edge(edgeKey: string): ConeEdgeRecord {
    return this.storedEdge(edgeKey) ?? ConeEdgeRecord.empty(edgeKey);
  }

  dotPage(set: ConeDotSet, writerId: string, pageIndex: number): ConeDotPage {
    const key = ConeRecordKey.forDotPage(set, writerId, pageIndex);
    return this.#typed(key, ConeDotPage) ?? ConeDotPage.empty(set, writerId, pageIndex);
  }

  adjacencyPage(nodeId: string, direction: ConeDirection, pageIndex: number): ConeAdjacencyPage {
    const key = ConeRecordKey.forAdjacencyPage(nodeId, direction, pageIndex);
    return this.#typed(key, ConeAdjacencyPage) ?? ConeAdjacencyPage.empty(nodeId, direction, pageIndex);
  }

  /** This snapshot with `records` replacing any stored record at the same key. */
  with(records: Iterable<ConeRecord>): ConeRecordSnapshot {
    return new ConeRecordSnapshot([...this.#records.values(), ...records]);
  }

  records(): readonly ConeRecord[] {
    return Object.freeze([...this.#records.values()]);
  }

  #typed<T extends ConeRecord>(key: ConeRecordKey, recordClass: RecordClass<T>): T | null {
    // A record is stored under its own key, and the key's family names its class.
    const record = this.get(key);
    return record instanceof recordClass ? record : null;
  }
}
