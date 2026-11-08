import { z } from 'zod';
import type ObservationAttemptId from '../../domain/services/custody/ObservationAttemptId.ts';
import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';
import RetiredWriteAttemptError from '../../domain/errors/RetiredWriteAttemptError.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import ObservationDecodeFailure from '../../domain/services/custody/ObservationDecodeFailure.ts';
import WriteOccurrence from '../../domain/api/WriteOccurrence.ts';
import WriteRace from '../../domain/api/WriteRace.ts';
import WriteAttemptListing from '../../domain/services/write/WriteAttemptListing.ts';
import WriteAttemptRecord from '../../domain/services/write/WriteAttemptRecord.ts';
import { buildWriteAttemptRef, buildWriteAttemptsPrefix } from '../../domain/utils/WriteAttemptRefLayout.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type ObservationCustodyCodecPort from '../../ports/ObservationCustodyCodecPort.ts';
import WriteAttemptJournalPort from '../../ports/WriteAttemptJournalPort.ts';

/**
 * 2: saves `races` (#1072). A version-1 record, which only clones built from `main` before #1072
 * can hold, saved no races; it is not read as a record with none.
 */
const RECORD_VERSION = 2;
/** The layout before #1072. Only clones of unreleased `main` wrote it, so it is refused by name, never read. */
const RETIRED_RECORD_VERSION = 1;
const retiredRecordSchema = z.object({ version: z.literal(RETIRED_RECORD_VERSION) });

/** A saved blob that holds a version-1 record: not unreadable, and not a record either. */
class RetiredRecord {}
const RETIRED = Object.freeze(new RetiredRecord());

const writersSchema = z.array(z.string());
const overflowSchema = z.number().int().nonnegative();
const causalitySchema = z.enum(['observed', 'underdetermined']);

/** A register race names its property; a lifecycle race names none. */
const storedRaceSchema = z.union([
  z.tuple([z.literal('register'), z.string(), z.string(), writersSchema, overflowSchema, causalitySchema]),
  z.tuple([z.literal('lifecycle'), z.string(), z.null(), writersSchema, overflowSchema, causalitySchema]),
]);

/** Exactly a `plural` write saved a race, as its record requires. */
const storedRecordSchema = z.object({
  version: z.literal(RECORD_VERSION),
  preparation: z.instanceof(Uint8Array),
  admission: z.enum(['derived', 'plural']),
  races: z.array(storedRaceSchema),
  occurrences: z.array(z.tuple([z.number(), z.string()])),
  savedAt: z.number(),
  reported: z.boolean(),
  commit: z.string().nullable(),
}).refine(({ admission, races }) => (admission === 'plural') === (races.length > 0));

/** The Git surface the journal uses: a blob per record, held by one ref each. */
export type WriteAttemptHistory = {
  writeBlob(content: Uint8Array): Promise<string>;
  readBlob(oid: string): Promise<Uint8Array>;
  updateRef(ref: string, oid: string): Promise<void>;
  readRef(ref: string): Promise<string | null>;
  deleteRef(ref: string): Promise<void>;
  readRefTargets(prefix: string): Promise<ReadonlyMap<string, string>>;
};

/**
 * Keeps each in-flight attempt in a clone-local ref, so a finished attempt leaves
 * nothing behind and the prefix lists exactly what is unfinished. Updating the ref
 * is the durable step: a record is saved once `save` returns. A listing starts somewhere
 * random, so records that never clear cannot starve the rest of a bounded sweep.
 */
export default class GitWriteAttemptJournalAdapter extends WriteAttemptJournalPort {
  readonly #graph: string;
  readonly #history: WriteAttemptHistory;
  readonly #codec: CodecPort;
  readonly #custodyCodec: ObservationCustodyCodecPort;

  constructor(fields: {
    readonly graph: string;
    readonly history: WriteAttemptHistory;
    readonly codec: CodecPort;
    readonly custodyCodec: ObservationCustodyCodecPort;
  }) {
    super();
    this.#graph = fields.graph;
    this.#history = fields.history;
    this.#codec = fields.codec;
    this.#custodyCodec = fields.custodyCodec;
  }

  override async save(record: WriteAttemptRecord): Promise<void> {
    const oid = await this.#history.writeBlob(this.#codec.encode({
      version: RECORD_VERSION,
      preparation: this.#custodyCodec.encodePreparation(record.preparation),
      admission: record.admission,
      races: record.races.map(({ kind, subject, key, writers, overflow, causality }) => [kind, subject, key, writers, overflow, causality]),
      occurrences: record.occurrences.map(({ intentIndex, subject }) => [intentIndex, subject]),
      savedAt: record.savedAt,
      reported: record.reported,
      commit: record.commit,
    }));
    await this.#history.updateRef(buildWriteAttemptRef(this.#graph, record.attemptId.value), oid);
  }

  override async read(attemptId: ObservationAttemptId): Promise<WriteAttemptRecord | null> {
    const ref = buildWriteAttemptRef(this.#graph, attemptId.value);
    const oid = await this.#history.readRef(ref);
    return oid === null ? null : this.#requireRecord(await this.#history.readBlob(oid), ref);
  }

  override async remove(attemptId: ObservationAttemptId): Promise<void> {
    await this.#history.deleteRef(buildWriteAttemptRef(this.#graph, attemptId.value));
  }

  override async list(limit: number): Promise<WriteAttemptListing> {
    const targets = [...(await this.#history.readRefTargets(buildWriteAttemptsPrefix(this.#graph))).entries()];
    const start = Math.floor(Math.random() * targets.length);
    const records: WriteAttemptRecord[] = [];
    const retiredRefs: string[] = [];
    for (const [ref, oid] of [...targets.slice(start), ...targets.slice(0, start)].slice(0, limit)) {
      const record = await this.#readRecord(oid);
      if (record instanceof RetiredRecord) {
        retiredRefs.push(ref);
      } else if (record !== null) {
        records.push(record);
      }
    }
    return new WriteAttemptListing({ records, retiredRefs });
  }

  /** A blob that does not decode is not a record, however it came to be there. */
  #decoded(bytes: Uint8Array): z.infer<typeof storedRecordSchema> | RetiredRecord | null {
    try {
      const value = this.#codec.decode(bytes);
      if (retiredRecordSchema.safeParse(value).success) {
        return RETIRED;
      }
      const parsed = storedRecordSchema.safeParse(value);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  /**
   * A record that exists but cannot be read is not an absent one: a caller told null may discard the attempt.
   * A retired one names its ref, so an operator can delete it.
   */
  #requireRecord(bytes: Uint8Array, ref: string): WriteAttemptRecord {
    const record = this.#decodedRecord(bytes);
    if (record instanceof RetiredRecord) {
      throw new RetiredWriteAttemptError(ref);
    }
    if (record === null) {
      throw new AdapterValidationError('A saved write attempt record could not be decoded');
    }
    return record;
  }

  #decodedRecord(bytes: Uint8Array): WriteAttemptRecord | RetiredRecord | null {
    const decoded = this.#decoded(bytes);
    if (decoded instanceof RetiredRecord) {
      return decoded;
    }
    return decoded === null ? null : this.#recordOf(decoded);
  }

  /** For a listing: one unreadable blob must not stop the rest. */
  async #readRecord(oid: string): Promise<WriteAttemptRecord | RetiredRecord | null> {
    try {
      return this.#decodedRecord(await this.#history.readBlob(oid));
    } catch {
      return null;
    }
  }

  #recordOf({ preparation: bytes, admission, races, occurrences, savedAt, reported, commit }: z.infer<typeof storedRecordSchema>): WriteAttemptRecord | null {
    const preparation = this.#custodyCodec.decodePreparation(bytes);
    if (preparation instanceof ObservationDecodeFailure || preparation.bindings.writePremise === null) {
      return null;
    }
    try {
      return new WriteAttemptRecord({
        preparation, admission, savedAt, reported, commit,
        races: races.map(([kind, subject, key, writers, overflow, causality]) => new WriteRace({ kind, subject, key, writers, overflow, causality })),
        occurrences: occurrences.map(([index, subject]) => new WriteOccurrence(index, subject)),
      });
    } catch (error) {
      return refusedRecord(error);
    }
  }
}

/** A record the domain refuses to hold, such as two races on one key, is no record; any other failure is not ours to hide. */
function refusedRecord(error: unknown): null {
  if (error instanceof WarpError) {
    return null;
  }
  throw error;
}
