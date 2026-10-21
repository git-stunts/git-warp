import { textDecode, textEncode } from '../../src/domain/utils/bytes.ts';
import { buildWorldlineMigrationRecordRef } from '../../src/domain/utils/RefLayout.ts';
import type { V21Damage } from './V21DamageReport.ts';
import type { V21ProvenanceEntry } from './V21Provenance.ts';

export const V21_MIGRATION_RECORD_FORMAT = 'git-warp-v21-migration';

export type V21StrandRecord = {
  name: string;
  legacyDescriptor: string;
  status: 'pending' | 'converted' | 'blocked';
  owner: string | null;
  occurrence: number | null;
  strandId: string | null;
  mint: string | null;
  reason: string | null;
};

/**
 * The migration's durable journal and result (#1015): what it migrated,
 * the reservations it made (so a resumed run reuses them), the provenance
 * map v21 readers resolve through, and the damage it found.
 */
export type V21MigrationRecord = {
  format: typeof V21_MIGRATION_RECORD_FORMAT;
  version: 1;
  graph: string;
  status: 'in-progress' | 'complete';
  /** The migration frontier: legacy heads at migration time, for late-write detection. */
  frontier: {
    lanes: Record<string, string>;
    legacyStrands: Record<string, string>;
    legacyOverlays: Record<string, string>;
  };
  floors: Record<string, number>;
  strands: V21StrandRecord[];
  provenance: V21ProvenanceEntry[];
  damage: V21Damage;
};

type RecordHistory = {
  readRef(ref: string): Promise<string | null>;
  readBlob(oid: string): Promise<Uint8Array>;
  writeBlob(content: Uint8Array | string): Promise<string>;
  compareAndSwapRef(ref: string, newOid: string, expectedOid: string | null): Promise<void>;
};

export { buildWorldlineMigrationRecordRef as v21MigrationRecordRef } from '../../src/domain/utils/RefLayout.ts';

/** Reads and writes the record with compare-and-swap, so two runs cannot interleave. */
export default class V21MigrationRecordStore {
  readonly #history: RecordHistory;
  readonly #ref: string;
  #revision: string | null = null;

  constructor(history: RecordHistory, graph: string) {
    this.#history = history;
    this.#ref = buildWorldlineMigrationRecordRef(graph);
  }

  async read(): Promise<V21MigrationRecord | null> {
    this.#revision = await this.#history.readRef(this.#ref);
    if (this.#revision === null) { return null; }
    const record = JSON.parse(textDecode(await this.#history.readBlob(this.#revision))) as V21MigrationRecord;
    if (record.format !== V21_MIGRATION_RECORD_FORMAT || record.version !== 1) {
      throw new Error(`${this.#ref} is not a v21 migration record`);
    }
    return record;
  }

  async write(record: V21MigrationRecord): Promise<void> {
    const oid = await this.#history.writeBlob(textEncode(`${JSON.stringify(record, null, 2)}\n`));
    if (oid === this.#revision) { return; }
    await this.#history.compareAndSwapRef(this.#ref, oid, this.#revision);
    this.#revision = oid;
  }
}
