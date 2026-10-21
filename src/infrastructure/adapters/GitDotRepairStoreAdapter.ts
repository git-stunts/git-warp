import z from 'zod';

import WarpError from '../../domain/errors/WarpError.ts';
import DotCollision from '../../domain/repair/DotCollision.ts';
import DotRepairRecord from '../../domain/repair/DotRepairRecord.ts';
import { buildDotRepairRef, buildDotRepairsPrefix, buildWorldlineMigrationRecordRef } from '../../domain/utils/RefLayout.ts';
import { textDecode, textEncode } from '../../domain/utils/bytes.ts';
import DotRepairStorePort from '../../ports/DotRepairStorePort.ts';

type RepairHistory = {
  readRef(ref: string): Promise<string | null>;
  readBlob(oid: string): Promise<Uint8Array>;
  writeBlob(content: Uint8Array | string): Promise<string>;
  listRefs(prefix: string): Promise<string[]>;
  compareAndSwapRef(ref: string, newOid: string, expectedOid: string | null): Promise<void>;
};

const migrationDamageSchema = z.object({
  strands: z.array(z.object({ name: z.string(), strandId: z.string().nullable() })),
  damage: z.object({
    duplicateDots: z.array(z.object({
      scope: z.string(),
      identity: z.string(),
      sites: z.array(z.object({ sha: z.string(), target: z.string() })),
    })),
  }),
});

const repairSchema = z.object({
  repairId: z.string(),
  dot: z.string(),
  policy: z.enum(['separate', 'restore']),
  targets: z.array(z.string()),
  repairWriter: z.string(),
  inputFrontier: z.record(z.string(), z.string()),
  status: z.enum(['pending', 'applied']),
  parentHead: z.string().nullable(),
  commits: z.array(z.string()),
});

/**
 * Reads the collisions the worldline migration recorded at
 * `refs/warp/<graph>/migrations/worldline`, and keeps one blob per repair at
 * `refs/warp/<graph>/repairs/<repair-id>` (#1022).
 */
export default class GitDotRepairStoreAdapter extends DotRepairStorePort {
  readonly #history: RepairHistory;
  readonly #graphName: string;

  constructor(options: Readonly<{ history: RepairHistory; graphName: string }>) {
    super();
    this.#history = options.history;
    this.#graphName = options.graphName;
  }

  override async collisions(): Promise<readonly DotCollision[]> {
    const ref = buildWorldlineMigrationRecordRef(this.#graphName);
    const oid = await this.#history.readRef(ref);
    if (oid === null) { return []; }
    const record = parse(migrationDamageSchema, await this.#json(oid), ref);
    const strandIds = new Map(record.strands.map((strand) => [`strand:${strand.name}`, strand.strandId]));
    return record.damage.duplicateDots.flatMap((duplicate) => {
      const scope = duplicate.scope === 'lane' ? 'lane' : strandIds.get(duplicate.scope) ?? null;
      return scope === null ? [] : [new DotCollision({
        scope,
        dot: duplicate.identity,
        sites: duplicate.sites.map((site) => ({ commit: site.sha, target: site.target })),
      })];
    });
  }

  override async repairs(): Promise<readonly DotRepairRecord[]> {
    const prefix = buildDotRepairsPrefix(this.#graphName);
    const records: DotRepairRecord[] = [];
    for (const ref of (await this.#history.listRefs(prefix)).sort()) {
      const record = await this.readRepair(ref.slice(prefix.length));
      if (record !== null) { records.push(record); }
    }
    return records;
  }

  override async readRepair(repairId: string): Promise<DotRepairRecord | null> {
    const ref = buildDotRepairRef(this.#graphName, repairId);
    const oid = await this.#history.readRef(ref);
    return oid === null ? null : new DotRepairRecord(parse(repairSchema, await this.#json(oid), ref));
  }

  /** Creates or replaces the record with compare-and-swap against the head it read. */
  override async writeRepair(record: DotRepairRecord): Promise<void> {
    const ref = buildDotRepairRef(this.#graphName, record.repairId);
    const expected = await this.#history.readRef(ref);
    const oid = await this.#history.writeBlob(textEncode(`${JSON.stringify(record, null, 2)}\n`));
    if (oid !== expected) { await this.#history.compareAndSwapRef(ref, oid, expected); }
  }

  async #json(oid: string): Promise<unknown> {
    return JSON.parse(textDecode(await this.#history.readBlob(oid)));
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown, ref: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new WarpError(`${ref} is not a readable record`, 'E_DOT_REPAIR_RECORD_CORRUPT', {
      context: { ref, issue: parsed.error.issues[0]?.message ?? 'unknown' },
    });
  }
  return parsed.data;
}
