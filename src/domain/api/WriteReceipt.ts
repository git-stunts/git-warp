import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import type { AdmissionOutcome } from './AdmissionOutcome.ts';
import { requireAdmissionOutcome } from './AdmissionOutcomeRuntime.ts';
import EntityOccurrence from './EntityOccurrence.ts';
import { requireIssuedEntityOccurrence } from './EntityOccurrenceRuntime.ts';
import type Evidence from './Evidence.ts';
import { freezeEvidence } from './EvidenceRuntime.ts';
import type Intent from './Intent.ts';
import IntentSequence, {
  type NormalizedWriteIntentInput,
  type WriteIntentInput,
} from './IntentSequence.ts';
import { freezeRepairHints, type RepairHint } from './ReceiptSupport.ts';

type WriteReceiptFields<TIntent extends WriteIntentInput> = {
  readonly lane: string;
  readonly writer: string;
  readonly intent: TIntent;
  readonly outcome: AdmissionOutcome;
  readonly evidence: Evidence;
  readonly occurrence?: EntityOccurrence;
  readonly occurrences?: readonly EntityOccurrence[];
  readonly repairHints?: readonly RepairHint[];
};

type WriteReceiptOccurrenceFields<TIntent extends WriteIntentInput> = Pick<
  WriteReceiptFields<TIntent>,
  'evidence' | 'intent' | 'lane' | 'occurrence' | 'occurrences' | 'outcome' | 'writer'
>;

type EntityOccurrenceValidation = Readonly<{
  readonly evidence: Evidence;
  readonly intent: Intent;
  readonly occurrence: EntityOccurrence;
  readonly receipt: Readonly<{ lane: string; writer: string }>;
}>;

type EntityOccurrencePair = Readonly<{
  readonly intent: Intent;
  readonly occurrence: EntityOccurrence;
}>;

export type WriteReceiptOptions<TIntent extends WriteIntentInput = Intent> =
  WriteReceiptFields<TIntent>;

export default class WriteReceipt<TIntent extends WriteIntentInput = Intent> {
  readonly evidence: Evidence;
  readonly intent: NormalizedWriteIntentInput<TIntent>;
  readonly intents: readonly Intent[];
  readonly operation: 'write' = 'write';
  readonly outcome: AdmissionOutcome;
  readonly occurrence: EntityOccurrence | undefined;
  readonly occurrences: readonly EntityOccurrence[];
  readonly repairHints: readonly RepairHint[];
  readonly reason: string | undefined;
  readonly lane: string;
  readonly writer: string;

  constructor(options: WriteReceiptOptions<TIntent> | null | undefined) {
    const fields = requireWriteReceiptOptions(options);
    const sequence = validateWriteReceiptFields(fields);

    this.lane = fields.lane;
    this.writer = fields.writer;
    this.intent = IntentSequence.snapshot(fields.intent);
    this.intents = sequence.intents;
    this.outcome = fields.outcome;
    this.evidence = freezeEvidence(fields.evidence, 'writeReceipt.evidence');
    this.occurrences = validateOccurrences(fields, this.evidence, this.intents);
    this.occurrence = this.occurrences.length === 1 ? this.occurrences[0] : undefined;
    this.repairHints = freezeRepairHints(fields.repairHints ?? []);
    this.reason =
      fields.outcome.kind === 'obstruction' ? fields.outcome.witness.reason.code : undefined;
    Object.freeze(this);
  }
}

function validateOccurrences<TIntent extends WriteIntentInput>(
  fields: WriteReceiptOccurrenceFields<TIntent>,
  evidence: Evidence,
  intents: readonly Intent[],
): readonly EntityOccurrence[] {
  const supplied = suppliedOccurrences(fields);
  if (!isAdmitted(fields.outcome)) {
    requireNoOccurrences(supplied);
    return Object.freeze([]);
  }
  const entityIntents = intents.filter(isEntityIntent);
  const pairs = pairEntityOccurrences(supplied, entityIntents);
  return Object.freeze(
    pairs.map(({ occurrence, intent }) =>
      requireEntityOccurrence({
        occurrence,
        intent,
        receipt: fields,
        evidence,
      }),
    ),
  );
}

function suppliedOccurrences<TIntent extends WriteIntentInput>(
  fields: WriteReceiptOccurrenceFields<TIntent>,
): readonly EntityOccurrence[] {
  requireExclusiveOccurrenceFields(fields);
  if (fields.occurrence !== undefined) {
    return Object.freeze([fields.occurrence]);
  }
  return freezeSuppliedOccurrences(fields.occurrences);
}

function requireExclusiveOccurrenceFields<TIntent extends WriteIntentInput>(
  fields: WriteReceiptOccurrenceFields<TIntent>,
): void {
  if (fields.occurrence !== undefined && fields.occurrences !== undefined) {
    throw occurrenceError('WriteReceipt cannot carry both occurrence fields');
  }
}

function freezeSuppliedOccurrences(
  occurrences: readonly EntityOccurrence[] | undefined,
): readonly EntityOccurrence[] {
  if (occurrences === undefined) {
    return Object.freeze([]);
  }
  requireOccurrenceArray(occurrences);
  return Object.freeze(occurrences.map((occurrence) => occurrence));
}

function requireOccurrenceArray(occurrences: readonly EntityOccurrence[]): void {
  if (!Array.isArray(occurrences)) {
    throw occurrenceError('WriteReceipt occurrences must be an array');
  }
}

function requireEntityOccurrence(fields: EntityOccurrenceValidation): EntityOccurrence {
  const { occurrence, intent, receipt, evidence } = fields;
  return requireIssuedEntityOccurrence(occurrence, {
    evidence,
    intents: Object.freeze([intent]),
    lane: receipt.lane,
    writer: receipt.writer,
  });
}

function pairEntityOccurrences(
  supplied: readonly EntityOccurrence[],
  expected: readonly Intent[],
): readonly EntityOccurrencePair[] {
  requireOccurrenceCardinality(supplied, expected);
  let index = 0;
  const pairs: EntityOccurrencePair[] = [];
  for (const intent of expected) {
    const occurrence = supplied[index];
    if (!(occurrence instanceof EntityOccurrence)) {
      throw occurrenceError('Admitted entity WriteReceipt requires every EntityOccurrence');
    }
    pairs.push(Object.freeze({ intent, occurrence }));
    index += 1;
  }
  return Object.freeze(pairs);
}

function requireOccurrenceCardinality(
  supplied: readonly EntityOccurrence[],
  expected: readonly Intent[],
): void {
  if (supplied.length !== expected.length) {
    throw occurrenceError(
      'Admitted WriteReceipt requires one EntityOccurrence per entity Intent',
    );
  }
}

function requireNoOccurrences(occurrences: readonly EntityOccurrence[]): void {
  if (occurrences.length > 0) {
    throw occurrenceError('Only an admitted WriteReceipt can carry EntityOccurrences');
  }
}

function isEntityIntent(intent: Intent): boolean {
  return intent.kind === 'entity.add';
}

function isAdmitted(outcome: AdmissionOutcome): boolean {
  return outcome.kind === 'derived' || outcome.kind === 'plural';
}

function validateWriteReceiptFields<TIntent extends WriteIntentInput>(
  fields: WriteReceiptOptions<TIntent>,
): IntentSequence {
  requireNonEmptyString(fields.lane, 'writeReceipt.lane');
  requireNonEmptyString(fields.writer, 'writeReceipt.writer');
  requireAdmissionOutcome(fields.outcome);
  return IntentSequence.from(fields.intent);
}

function occurrenceError(message: string): WarpError {
  return new WarpError(message, 'E_WRITE_RECEIPT_ENTITY_OCCURRENCE');
}

function requireWriteReceiptOptions<TIntent extends WriteIntentInput>(
  options: WriteReceiptOptions<TIntent> | null | undefined,
): WriteReceiptOptions<TIntent> {
  if (options === null || options === undefined) {
    throw new WarpError('WriteReceipt options are required', 'E_WRITE_RECEIPT_OPTIONS');
  }
  return options;
}
