import z from 'zod';

import WarpError from '../../domain/errors/WarpError.ts';
import AllocationProvenance, { type AllocationProvenanceStatus } from '../../domain/migrations/AllocationProvenance.ts';
import { buildWorldlineMigrationRecordRef } from '../../domain/utils/RefLayout.ts';
import { textDecode } from '../../domain/utils/bytes.ts';
import AllocationProvenancePort from '../../ports/AllocationProvenancePort.ts';

type RecordHistory = {
  readRef(ref: string): Promise<string | null>;
  readBlob(oid: string): Promise<Uint8Array>;
};

type RecordedProvenance = Readonly<{
  status: AllocationProvenanceStatus;
  original: string;
  identity: string | null;
  candidates: readonly string[];
}>;

/**
 * Resolves allocation provenance from the worldline migration record at
 * `refs/warp/<graph>/migrations/worldline` (#1015). A graph that was never
 * migrated, or an occurrence the record does not list, is `unmapped`.
 */
export default class GitMigrationProvenanceAdapter extends AllocationProvenancePort {
  readonly #history: RecordHistory;
  readonly #graphName: string;
  #entries: Promise<ReadonlyMap<string, RecordedProvenance>> | null = null;

  constructor(options: Readonly<{ history: RecordHistory; graphName: string }>) {
    super();
    this.#history = options.history;
    this.#graphName = options.graphName;
  }

  override async resolve(commit: string, operationIndex: number, original: string): Promise<AllocationProvenance> {
    this.#entries ??= this.#load();
    const recorded = (await this.#entries).get(`${commit}:${operationIndex}`);
    if (recorded === undefined || recorded.original !== original) {
      return AllocationProvenance.unmapped(original);
    }
    return new AllocationProvenance(recorded);
  }

  async #load(): Promise<ReadonlyMap<string, RecordedProvenance>> {
    const ref = buildWorldlineMigrationRecordRef(this.#graphName);
    const oid = await this.#history.readRef(ref);
    if (oid === null) { return new Map(); }
    const record: unknown = JSON.parse(textDecode(await this.#history.readBlob(oid)));
    return new Map(provenanceOf(record, ref).map((entry) => [`${entry.commit}:${entry.operationIndex}`, entry]));
  }
}

const recordSchema = z.object({
  provenance: z.array(z.object({
    commit: z.string().min(1),
    operationIndex: z.number().int().nonnegative(),
    status: z.enum(['resolved', 'unmapped', 'ambiguous']),
    original: z.string().min(1),
    identity: z.string().min(1).nullable(),
    candidates: z.array(z.string()),
  })),
});

function provenanceOf(record: unknown, ref: string): Array<RecordedProvenance & { commit: string; operationIndex: number }> {
  const parsed = recordSchema.safeParse(record);
  if (!parsed.success) {
    throw new WarpError(`${ref} is not a readable worldline migration record`, 'E_MIGRATION_RECORD_CORRUPT', {
      context: { ref, issue: parsed.error.issues[0]?.message ?? 'unknown' },
    });
  }
  return parsed.data.provenance;
}
