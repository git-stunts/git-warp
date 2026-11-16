import { z } from 'zod';
import type ObservationAttemptId from '../../domain/services/custody/ObservationAttemptId.ts';
import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';
import UnsupportedWriteAttemptLayoutError from '../../domain/errors/UnsupportedWriteAttemptLayoutError.ts';
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
 * 2: saves `races` (#1072). A well-formed record in any other layout is refused by its ref,
 * never read: version 1 came only from clones of unreleased `main` and saved no races.
 */
const RECORD_VERSION = 2;
const otherLayoutSchema = z.object({
  version: z.number().int().nonnegative().refine((version) => version !== RECORD_VERSION),
});
const preparedSchema = z.object({ preparation: z.instanceof(Uint8Array) });

/** A record in a layout this build does not read, known by its layout and, while it still names one, its writer. */
class OtherLayoutRecord {
  readonly version: number;
  readonly writer: string | null;

  constructor(version: number, writer: string | null) {
    this.version = version;
    this.writer = writer;
    Object.freeze(this);
  }
}

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

  /**
   * An other-layout record is reported by its ref and does not count against `limit`. At most
   * `limit` of them are passed over, so one listing reads O(limit) blobs however many a clone holds.
   */
  override async list(limit: number): Promise<WriteAttemptListing> {
    const targets = [...(await this.#history.readRefTargets(buildWriteAttemptsPrefix(this.#graph))).entries()];
    const start = Math.floor(Math.random() * targets.length);
    const records: WriteAttemptRecord[] = [];
    const unsupportedRefs: string[] = [];
    let examined = 0;
    for (const [ref, oid] of [...targets.slice(start), ...targets.slice(0, start)]) {
      if (examined >= limit || unsupportedRefs.length >= limit) {
        break;
      }
      const record = await this.#readRecord(oid);
      examined += record instanceof OtherLayoutRecord ? 0 : 1;
      collect(record, { ref, records, unsupportedRefs });
    }
    return new WriteAttemptListing({ records, unsupportedRefs });
  }

  /** A blob that does not decode is not a record, however it came to be there. */
  #decoded(bytes: Uint8Array): z.infer<typeof storedRecordSchema> | OtherLayoutRecord | null {
    try {
      const value = this.#codec.decode(bytes);
      const other = otherLayoutSchema.safeParse(value);
      if (other.success) {
        return new OtherLayoutRecord(other.data.version, this.#writerOf(value));
      }
      const parsed = storedRecordSchema.safeParse(value);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  /** The writer an other-layout record still names, or null when its preparation is gone, unreadable or not a write. */
  #writerOf(value: unknown): string | null {
    const prepared = preparedSchema.safeParse(value);
    if (!prepared.success) {
      return null;
    }
    const preparation = this.#custodyCodec.decodePreparation(prepared.data.preparation);
    return preparation instanceof ObservationDecodeFailure ? null : preparation.bindings.writePremise?.writerId ?? null;
  }

  /**
   * A record that exists but cannot be read is not an absent one: a caller told null may discard the attempt.
   * One in another layout names its ref, its layout and, if it still names one, its writer.
   */
  #requireRecord(bytes: Uint8Array, ref: string): WriteAttemptRecord {
    const record = this.#decodedRecord(bytes);
    if (record instanceof OtherLayoutRecord) {
      throw new UnsupportedWriteAttemptLayoutError({ ref, version: record.version, writer: record.writer, readable: RECORD_VERSION });
    }
    if (record === null) {
      throw new AdapterValidationError('A saved write attempt record could not be decoded');
    }
    return record;
  }

  #decodedRecord(bytes: Uint8Array): WriteAttemptRecord | OtherLayoutRecord | null {
    const decoded = this.#decoded(bytes);
    if (decoded instanceof OtherLayoutRecord) {
      return decoded;
    }
    return decoded === null ? null : this.#recordOf(decoded);
  }

  /** For a listing: one unreadable blob must not stop the rest. */
  async #readRecord(oid: string): Promise<WriteAttemptRecord | OtherLayoutRecord | null> {
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

/** Sorts one listed blob into the page: a record, an other-layout ref, or nothing. */
function collect(record: WriteAttemptRecord | OtherLayoutRecord | null, into: {
  readonly ref: string;
  readonly records: WriteAttemptRecord[];
  readonly unsupportedRefs: string[];
}): void {
  if (record instanceof OtherLayoutRecord) {
    into.unsupportedRefs.push(into.ref);
  } else if (record !== null) {
    into.records.push(record);
  }
}

/** A record the domain refuses to hold, such as two races on one key, is no record; any other failure is not ours to hide. */
function refusedRecord(error: unknown): null {
  if (error instanceof WarpError) {
    return null;
  }
  throw error;
}
