import GenesisEquivalenceMismatch, {
  GENESIS_EQUIVALENCE_CHANGED_FIELD,
  GENESIS_EQUIVALENCE_EXTRA_FACT,
  GENESIS_EQUIVALENCE_MISSING_FACT,
  type GenesisEquivalenceMismatchKind,
} from './GenesisEquivalenceMismatch.ts';
import {
  GENESIS_EQUIVALENCE_CONTENT_ATTACHMENT_FACT,
  GENESIS_EQUIVALENCE_EDGE_FACT,
  GENESIS_EQUIVALENCE_NODE_FACT,
  GENESIS_EQUIVALENCE_PROPERTY_FACT,
  type GenesisEquivalenceReadingFactKind,
} from './GenesisEquivalenceReadingFact.ts';
import WarpError from '../errors/WarpError.ts';

const VALUE_SUMMARY_LIMIT = 80;

export type GenesisDivergenceReportFields = {
  readonly mismatchKind: GenesisEquivalenceMismatchKind;
  readonly factKind: GenesisEquivalenceReadingFactKind;
  readonly factKey: string;
  readonly fieldPath: string;
  readonly writerId: string | null;
  readonly patchId: string | null;
  readonly operationIndex: number | null;
  readonly legacyValueSummary: string | null;
  readonly migratedValueSummary: string | null;
};

/** Runtime-backed first-divergence report for genesis replay proof failures. */
export default class GenesisDivergenceReport {
  readonly mismatchKind: GenesisEquivalenceMismatchKind;
  readonly factKind: GenesisEquivalenceReadingFactKind;
  readonly factKey: string;
  readonly fieldPath: string;
  readonly writerId: string | null;
  readonly patchId: string | null;
  readonly operationIndex: number | null;
  readonly legacyValueSummary: string | null;
  readonly migratedValueSummary: string | null;

  constructor(fields: GenesisDivergenceReportFields) {
    const checkedFields = requireFields(fields);
    this.mismatchKind = requireMismatchKind(checkedFields.mismatchKind);
    this.factKind = requireFactKind(checkedFields.factKind);
    this.factKey = requireNonEmptyString(checkedFields.factKey, 'factKey');
    this.fieldPath = requireNonEmptyString(checkedFields.fieldPath, 'fieldPath');
    this.writerId = requireNullableString(checkedFields.writerId, 'writerId');
    this.patchId = requireNullableString(checkedFields.patchId, 'patchId');
    this.operationIndex = requireNullableOperationIndex(checkedFields.operationIndex);
    this.legacyValueSummary = requireNullableString(
      checkedFields.legacyValueSummary,
      'legacyValueSummary',
    );
    this.migratedValueSummary = requireNullableString(
      checkedFields.migratedValueSummary,
      'migratedValueSummary',
    );
    Object.freeze(this);
  }

  /** Builds a divergence report from the first structured mismatch. */
  static fromMismatch(mismatch: GenesisEquivalenceMismatch): GenesisDivergenceReport {
    const checkedMismatch = requireMismatch(mismatch);
    return new GenesisDivergenceReport({
      mismatchKind: checkedMismatch.kind,
      factKind: checkedMismatch.factKind,
      factKey: checkedMismatch.factKey,
      fieldPath: checkedMismatch.fieldPath,
      writerId: writerIdFromMismatch(checkedMismatch),
      patchId: patchIdFromMismatch(checkedMismatch),
      operationIndex: operationIndexFromMismatch(checkedMismatch),
      legacyValueSummary: summarizeValue(checkedMismatch.legacyValue),
      migratedValueSummary: summarizeValue(checkedMismatch.migratedValue),
    });
  }

  /** Renders deterministic operator-facing report lines. */
  toSummaryLines(): readonly string[] {
    return Object.freeze([
      `mismatchKind: ${this.mismatchKind}`,
      `factKind: ${this.factKind}`,
      `factKey: ${this.factKey}`,
      `fieldPath: ${this.fieldPath}`,
      `writerId: ${displayUnavailable(this.writerId)}`,
      `patchId: ${displayUnavailable(this.patchId)}`,
      `operationIndex: ${displayUnavailableNumber(this.operationIndex)}`,
      `legacyValue: ${displayMissing(this.legacyValueSummary)}`,
      `migratedValue: ${displayMissing(this.migratedValueSummary)}`,
    ]);
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GenesisDivergenceReportFields | null | undefined,
): GenesisDivergenceReportFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GenesisDivergenceReport fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a mismatch instance. */
function requireMismatch(mismatch: GenesisEquivalenceMismatch): GenesisEquivalenceMismatch {
  if (!(mismatch instanceof GenesisEquivalenceMismatch)) {
    throw new WarpError('mismatch must be a GenesisEquivalenceMismatch', 'E_VALIDATION');
  }
  return mismatch;
}

/** Validates mismatch kind strings. */
function requireMismatchKind(kind: GenesisEquivalenceMismatchKind): GenesisEquivalenceMismatchKind {
  if (
    kind !== GENESIS_EQUIVALENCE_MISSING_FACT
    && kind !== GENESIS_EQUIVALENCE_EXTRA_FACT
    && kind !== GENESIS_EQUIVALENCE_CHANGED_FIELD
  ) {
    throw new WarpError('GenesisDivergenceReport mismatchKind is unsupported', 'E_VALIDATION');
  }
  return kind;
}

/** Validates visible fact kind strings. */
function requireFactKind(kind: GenesisEquivalenceReadingFactKind): GenesisEquivalenceReadingFactKind {
  if (
    kind !== GENESIS_EQUIVALENCE_NODE_FACT
    && kind !== GENESIS_EQUIVALENCE_EDGE_FACT
    && kind !== GENESIS_EQUIVALENCE_PROPERTY_FACT
    && kind !== GENESIS_EQUIVALENCE_CONTENT_ATTACHMENT_FACT
  ) {
    throw new WarpError('GenesisDivergenceReport factKind is unsupported', 'E_VALIDATION');
  }
  return kind;
}

/** Validates a required non-empty string. */
function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}

/** Validates nullable strings. */
function requireNullableString(value: string | null, name: string): string | null {
  if (value !== null && typeof value !== 'string') {
    throw new WarpError(`${name} must be a string or null`, 'E_VALIDATION');
  }
  return value;
}

/** Validates nullable operation index evidence. */
function requireNullableOperationIndex(value: number | null): number | null {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
    throw new WarpError('operationIndex must be a non-negative safe integer or null', 'E_VALIDATION');
  }
  return value;
}

/** Reads writer evidence from a mismatch when present. */
function writerIdFromMismatch(mismatch: GenesisEquivalenceMismatch): string | null {
  if (mismatch.boundary === null) {
    return null;
  }
  return mismatch.boundary.writerId;
}

/** Reads patch evidence from a mismatch when present. */
function patchIdFromMismatch(mismatch: GenesisEquivalenceMismatch): string | null {
  if (mismatch.boundary === null) {
    return null;
  }
  return mismatch.boundary.patchId;
}

/** Reads operation evidence from a mismatch when present. */
function operationIndexFromMismatch(mismatch: GenesisEquivalenceMismatch): number | null {
  if (mismatch.boundary === null) {
    return null;
  }
  return mismatch.boundary.operationIndex;
}

/** Produces a bounded deterministic value summary. */
function summarizeValue(value: string | null): string | null {
  if (value === null || value.length <= VALUE_SUMMARY_LIMIT) {
    return value;
  }
  return `${value.slice(0, VALUE_SUMMARY_LIMIT)}...`;
}

/** Displays an absent identity value as unavailable. */
function displayUnavailable(value: string | null): string {
  if (value === null) {
    return '(unavailable)';
  }
  return value;
}

/** Displays an absent operation index as unavailable. */
function displayUnavailableNumber(value: number | null): string {
  if (value === null) {
    return '(unavailable)';
  }
  return String(value);
}

/** Displays an absent reading value as missing. */
function displayMissing(value: string | null): string {
  if (value === null) {
    return '(missing)';
  }
  return value;
}
