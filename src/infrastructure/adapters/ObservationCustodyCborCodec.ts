import z from 'zod';
import ObservationAttemptId from '../../domain/services/custody/ObservationAttemptId.ts';
import ObservationBindings from '../../domain/services/custody/ObservationBindings.ts';
import ObservationBudget from '../../domain/services/custody/ObservationBudget.ts';
import ObservationDecodeFailure from '../../domain/services/custody/ObservationDecodeFailure.ts';
import ObservationDigest from '../../domain/services/custody/ObservationDigest.ts';
import ObservationEvidenceBinding from '../../domain/services/custody/ObservationEvidenceBinding.ts';
import ObservationPreparation from '../../domain/services/custody/ObservationPreparation.ts';
import ObservationPreparedPage from '../../domain/services/custody/ObservationPreparedPage.ts';
import ObservationPublicationEvidence from '../../domain/services/custody/ObservationPublicationEvidence.ts';
import ObservationQuestion from '../../domain/services/custody/ObservationQuestion.ts';
import ObservationReceiptCore from '../../domain/services/custody/ObservationReceiptCore.ts';
import ObservationRecord from '../../domain/services/custody/ObservationRecord.ts';
import ObservationSettlementPage from '../../domain/services/custody/ObservationSettlementPage.ts';
import ObservationSupportSummary from '../../domain/services/custody/ObservationSupportSummary.ts';
import ObservationWritePremise from '../../domain/services/custody/ObservationWritePremise.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import ObservationCustodyCodecPort from '../../ports/ObservationCustodyCodecPort.ts';

const WIRE_VERSION = 1;
const PREPARATION_DOMAIN = 'git-warp/observation-preparation';
const CORE_DOMAIN = 'git-warp/observation-receipt-core';
const RECORD_DOMAIN = 'git-warp/observation-record';
const PREPARED_PAGE_DOMAIN = 'git-warp/observation-prepared-page';
const SETTLEMENT_PAGE_DOMAIN = 'git-warp/observation-settlement-page';

function header<T extends string>(domain: T): { domain: z.ZodLiteral<T>; version: z.ZodLiteral<1> } {
  return { domain: z.literal(domain), version: z.literal(WIRE_VERSION) };
}

const BYTES_WIRE = z.instanceof(Uint8Array);
const PREMISE_WIRE = z.strictObject({
  intents: z.string(), predecessor: z.string().nullable(), writerId: z.string(),
});
const PREPARATION_WIRE = z.strictObject({
  ...header(PREPARATION_DOMAIN),
  attempt: z.string(),
  basis: z.string(),
  budget: z.strictObject({ bytes: z.number(), records: z.number(), work: z.number() }),
  evidence: z.array(z.strictObject({
    digest: z.string(), kind: z.enum(['authority', 'law', 'dependency']),
  })),
  observer: z.string(),
  purpose: z.string(),
  question: z.strictObject({ name: z.string(), version: z.number() }),
  writePremise: PREMISE_WIRE.nullable(),
});
const CORE_WIRE = z.strictObject({
  ...header(CORE_DOMAIN),
  family: z.enum(['write', 'observation']),
  outcome: BYTES_WIRE,
  variant: z.string(),
});
const RECORD_WIRE = z.strictObject({
  ...header(RECORD_DOMAIN),
  core: z.string(),
  preparation: z.string(),
  publication: z.strictObject({ commit: z.string(), writerId: z.string() }).nullable(),
});
const PREPARED_PAGE_WIRE = z.strictObject({
  ...header(PREPARED_PAGE_DOMAIN),
  dependencies: z.number(),
  dependency: z.string(),
  history: z.string(),
  pages: z.array(z.string()),
  preparation: BYTES_WIRE,
  writers: z.number(),
});
const SETTLEMENT_PAGE_WIRE = z.strictObject({
  ...header(SETTLEMENT_PAGE_DOMAIN),
  core: BYTES_WIRE,
  record: BYTES_WIRE,
});

/**
 * Canonical CBOR of observation identity (#1067). Every field map is written
 * in sorted key order with an explicit domain and wire version. A value decodes
 * only when re-encoding it reproduces the stored bytes exactly, which rejects
 * alternate encodings and duplicate fields rather than normalizing them into
 * an accepted identity.
 */
export default class ObservationCustodyCborCodec extends ObservationCustodyCodecPort {
  readonly #codec: CodecPort;

  constructor(codec: CodecPort) {
    super();
    this.#codec = codec;
  }

  override encodePreparation(preparation: ObservationPreparation): Uint8Array {
    const { attemptId, bindings } = preparation;
    return this.#codec.encode({
      domain: PREPARATION_DOMAIN,
      version: WIRE_VERSION,
      attempt: attemptId.value,
      basis: bindings.basis,
      budget: { bytes: bindings.budget.bytes, records: bindings.budget.records, work: bindings.budget.work },
      evidence: bindings.evidence.map((entry) => ({ digest: entry.digest.hex, kind: entry.kind })),
      observer: bindings.observer,
      purpose: bindings.purpose,
      question: { name: bindings.question.name, version: bindings.question.version },
      writePremise: encodePremise(bindings.writePremise),
    });
  }

  override decodePreparation(bytes: Uint8Array): ObservationPreparation | ObservationDecodeFailure {
    return this.#strictly(bytes, PREPARATION_WIRE, {
      build: decodedPreparation,
      encode: (value) => this.encodePreparation(value),
    });
  }

  override encodeCore(core: ObservationReceiptCore): Uint8Array {
    return this.#codec.encode({
      domain: CORE_DOMAIN,
      version: WIRE_VERSION,
      family: core.family,
      outcome: core.outcome(),
      variant: core.variant,
    });
  }

  override decodeCore(bytes: Uint8Array): ObservationReceiptCore | ObservationDecodeFailure {
    return this.#strictly(bytes, CORE_WIRE, {
      build: (wire) => new ObservationReceiptCore({ family: wire.family, variant: wire.variant, outcome: wire.outcome }),
      encode: (value) => this.encodeCore(value),
    });
  }

  override encodeRecord(record: ObservationRecord): Uint8Array {
    const { publication } = record;
    return this.#codec.encode({
      domain: RECORD_DOMAIN,
      version: WIRE_VERSION,
      core: record.core.hex,
      preparation: record.preparation.hex,
      publication: publication === null ? null : { commit: publication.commit, writerId: publication.writerId },
    });
  }

  override decodeRecord(bytes: Uint8Array): ObservationRecord | ObservationDecodeFailure {
    return this.#strictly(bytes, RECORD_WIRE, {
      build: decodedRecord,
      encode: (value) => this.encodeRecord(value),
    });
  }

  override encodePreparedPage(page: ObservationPreparedPage): Uint8Array {
    const { summary } = page;
    return this.#codec.encode({
      domain: PREPARED_PAGE_DOMAIN,
      version: WIRE_VERSION,
      dependencies: summary.dependencies,
      dependency: summary.dependency.hex,
      history: summary.history.hex,
      pages: [...summary.pages],
      preparation: page.preparation(),
      writers: summary.writers,
    });
  }

  override decodePreparedPage(bytes: Uint8Array): ObservationPreparedPage | ObservationDecodeFailure {
    return this.#strictly(bytes, PREPARED_PAGE_WIRE, {
      build: decodedPreparedPage,
      encode: (value) => this.encodePreparedPage(value),
    });
  }

  override encodeSettlementPage(page: ObservationSettlementPage): Uint8Array {
    return this.#codec.encode({
      domain: SETTLEMENT_PAGE_DOMAIN,
      version: WIRE_VERSION,
      core: page.core(),
      record: page.record(),
    });
  }

  override decodeSettlementPage(bytes: Uint8Array): ObservationSettlementPage | ObservationDecodeFailure {
    return this.#strictly(bytes, SETTLEMENT_PAGE_WIRE, {
      build: (wire) => new ObservationSettlementPage(wire.record, wire.core),
      encode: (value) => this.encodeSettlementPage(value),
    });
  }

  /** Decodes, validates and constructs one value, accepting only its canonical bytes. */
  #strictly<TWire, TValue>(
    bytes: Uint8Array,
    wire: z.ZodType<TWire>,
    value: { readonly build: (decoded: TWire) => TValue; readonly encode: (built: TValue) => Uint8Array },
  ): TValue | ObservationDecodeFailure {
    try {
      const built = value.build(wire.parse(this.#codec.decode<unknown>(bytes)));
      return bytesEqual(value.encode(built), bytes) ? built : new ObservationDecodeFailure('non-canonical encoding');
    } catch {
      return new ObservationDecodeFailure('undecodable');
    }
  }
}

function encodePremise(premise: ObservationWritePremise | null): z.infer<typeof PREMISE_WIRE> | null {
  if (premise === null) {
    return null;
  }
  return { intents: premise.intents.hex, predecessor: premise.predecessor, writerId: premise.writerId };
}

function decodedPreparation(wire: z.infer<typeof PREPARATION_WIRE>): ObservationPreparation {
  return new ObservationPreparation(new ObservationAttemptId(wire.attempt), new ObservationBindings({
    basis: wire.basis,
    observer: wire.observer,
    question: new ObservationQuestion(wire.question.name, wire.question.version),
    purpose: wire.purpose,
    budget: new ObservationBudget(wire.budget),
    evidence: wire.evidence.map((entry) => new ObservationEvidenceBinding(entry.kind, new ObservationDigest(entry.digest))),
    writePremise: decodedPremise(wire.writePremise),
  }));
}

function decodedPremise(wire: z.infer<typeof PREMISE_WIRE> | null): ObservationWritePremise | null {
  if (wire === null) {
    return null;
  }
  return new ObservationWritePremise({
    intents: new ObservationDigest(wire.intents), writerId: wire.writerId, predecessor: wire.predecessor,
  });
}

function decodedRecord(wire: z.infer<typeof RECORD_WIRE>): ObservationRecord {
  return new ObservationRecord({
    preparation: new ObservationDigest(wire.preparation),
    core: new ObservationDigest(wire.core),
    publication: wire.publication === null
      ? null
      : new ObservationPublicationEvidence(wire.publication.writerId, wire.publication.commit),
  });
}

function decodedPreparedPage(wire: z.infer<typeof PREPARED_PAGE_WIRE>): ObservationPreparedPage {
  return new ObservationPreparedPage(wire.preparation, new ObservationSupportSummary({
    writers: wire.writers,
    history: new ObservationDigest(wire.history),
    dependencies: wire.dependencies,
    dependency: new ObservationDigest(wire.dependency),
    pages: wire.pages,
  }));
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}
