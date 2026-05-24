import GenesisEquivalenceBoundary from './GenesisEquivalenceBoundary.ts';
import {
  GENESIS_EQUIVALENCE_CONTENT_ATTACHMENT_FACT,
  GENESIS_EQUIVALENCE_EDGE_FACT,
  GENESIS_EQUIVALENCE_NODE_FACT,
  GENESIS_EQUIVALENCE_PROPERTY_FACT,
  type GenesisEquivalenceReadingFactKind,
} from './GenesisEquivalenceReadingFact.ts';
import WarpError from '../errors/WarpError.ts';

export const GENESIS_EQUIVALENCE_MISSING_FACT = 'missing';
export const GENESIS_EQUIVALENCE_EXTRA_FACT = 'extra';
export const GENESIS_EQUIVALENCE_CHANGED_FIELD = 'changed';

export type GenesisEquivalenceMismatchKind =
  | typeof GENESIS_EQUIVALENCE_MISSING_FACT
  | typeof GENESIS_EQUIVALENCE_EXTRA_FACT
  | typeof GENESIS_EQUIVALENCE_CHANGED_FIELD;

export type GenesisEquivalenceMismatchFields = {
  readonly kind: GenesisEquivalenceMismatchKind;
  readonly factKind: GenesisEquivalenceReadingFactKind;
  readonly factKey: string;
  readonly fieldPath: string;
  readonly legacyValue: string | null;
  readonly migratedValue: string | null;
  readonly boundary: GenesisEquivalenceBoundary | null;
};

/** Runtime-backed structured difference between legacy and migrated readings. */
export default class GenesisEquivalenceMismatch {
  readonly kind: GenesisEquivalenceMismatchKind;
  readonly factKind: GenesisEquivalenceReadingFactKind;
  readonly factKey: string;
  readonly fieldPath: string;
  readonly legacyValue: string | null;
  readonly migratedValue: string | null;
  readonly boundary: GenesisEquivalenceBoundary | null;

  constructor(fields: GenesisEquivalenceMismatchFields) {
    const checkedFields = requireFields(fields);
    this.kind = requireKind(checkedFields.kind);
    this.factKind = requireFactKind(checkedFields.factKind);
    this.factKey = requireNonEmptyString(checkedFields.factKey, 'factKey');
    this.fieldPath = requireNonEmptyString(checkedFields.fieldPath, 'fieldPath');
    this.legacyValue = requireNullableString(checkedFields.legacyValue, 'legacyValue');
    this.migratedValue = requireNullableString(checkedFields.migratedValue, 'migratedValue');
    this.boundary = requireOptionalBoundary(checkedFields.boundary);
    requireValuesMatchKind(this.kind, this.legacyValue, this.migratedValue);
    Object.freeze(this);
  }

  /** Returns a deterministic mismatch key. */
  toKey(): string {
    return `${this.kind}\0${this.factKind}\0${this.factKey}\0${this.fieldPath}`;
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GenesisEquivalenceMismatchFields | null | undefined,
): GenesisEquivalenceMismatchFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GenesisEquivalenceMismatch fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Validates the mismatch kind. */
function requireKind(kind: GenesisEquivalenceMismatchKind): GenesisEquivalenceMismatchKind {
  if (
    kind !== GENESIS_EQUIVALENCE_MISSING_FACT
    && kind !== GENESIS_EQUIVALENCE_EXTRA_FACT
    && kind !== GENESIS_EQUIVALENCE_CHANGED_FIELD
  ) {
    throw new WarpError('GenesisEquivalenceMismatch kind is unsupported', 'E_VALIDATION');
  }
  return kind;
}

/** Validates the visible fact kind. */
function requireFactKind(kind: GenesisEquivalenceReadingFactKind): GenesisEquivalenceReadingFactKind {
  if (
    kind !== GENESIS_EQUIVALENCE_NODE_FACT
    && kind !== GENESIS_EQUIVALENCE_EDGE_FACT
    && kind !== GENESIS_EQUIVALENCE_PROPERTY_FACT
    && kind !== GENESIS_EQUIVALENCE_CONTENT_ATTACHMENT_FACT
  ) {
    throw new WarpError('GenesisEquivalenceMismatch factKind is unsupported', 'E_VALIDATION');
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

/** Validates nullable string values. */
function requireNullableString(value: string | null, name: string): string | null {
  if (value !== null && typeof value !== 'string') {
    throw new WarpError(`${name} must be a string or null`, 'E_VALIDATION');
  }
  return value;
}

/** Requires boundary evidence when present. */
function requireOptionalBoundary(
  boundary: GenesisEquivalenceBoundary | null,
): GenesisEquivalenceBoundary | null {
  if (boundary !== null && !(boundary instanceof GenesisEquivalenceBoundary)) {
    throw new WarpError('boundary must be a GenesisEquivalenceBoundary', 'E_VALIDATION');
  }
  return boundary;
}

/** Requires values to match the structural mismatch kind. */
function requireValuesMatchKind(
  kind: GenesisEquivalenceMismatchKind,
  legacyValue: string | null,
  migratedValue: string | null,
): void {
  requireMissingValues(kind, legacyValue, migratedValue);
  requireExtraValues(kind, legacyValue, migratedValue);
  requireChangedValues(kind, legacyValue, migratedValue);
}

/** Requires missing mismatches to carry only legacy values. */
function requireMissingValues(
  kind: GenesisEquivalenceMismatchKind,
  legacyValue: string | null,
  migratedValue: string | null,
): void {
  if (kind !== GENESIS_EQUIVALENCE_MISSING_FACT) {
    return;
  }
  if (legacyValue !== null && migratedValue === null) {
    return;
  }
  throw new WarpError('missing mismatches require only a legacy value', 'E_VALIDATION');
}

/** Requires extra mismatches to carry only migrated values. */
function requireExtraValues(
  kind: GenesisEquivalenceMismatchKind,
  legacyValue: string | null,
  migratedValue: string | null,
): void {
  if (kind !== GENESIS_EQUIVALENCE_EXTRA_FACT) {
    return;
  }
  if (legacyValue === null && migratedValue !== null) {
    return;
  }
  throw new WarpError('extra mismatches require only a migrated value', 'E_VALIDATION');
}

/** Requires changed mismatches to carry both values. */
function requireChangedValues(
  kind: GenesisEquivalenceMismatchKind,
  legacyValue: string | null,
  migratedValue: string | null,
): void {
  if (kind !== GENESIS_EQUIVALENCE_CHANGED_FIELD) {
    return;
  }
  if (legacyValue !== null && migratedValue !== null) {
    return;
  }
  throw new WarpError('changed mismatches require both values', 'E_VALIDATION');
}
