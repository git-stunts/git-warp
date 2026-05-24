import GenesisEquivalenceBoundary from './GenesisEquivalenceBoundary.ts';
import WarpError from '../errors/WarpError.ts';

export const GENESIS_EQUIVALENCE_NODE_FACT = 'node';
export const GENESIS_EQUIVALENCE_EDGE_FACT = 'edge';
export const GENESIS_EQUIVALENCE_PROPERTY_FACT = 'property';
export const GENESIS_EQUIVALENCE_CONTENT_ATTACHMENT_FACT = 'content-attachment';

export type GenesisEquivalenceReadingFactKind =
  | typeof GENESIS_EQUIVALENCE_NODE_FACT
  | typeof GENESIS_EQUIVALENCE_EDGE_FACT
  | typeof GENESIS_EQUIVALENCE_PROPERTY_FACT
  | typeof GENESIS_EQUIVALENCE_CONTENT_ATTACHMENT_FACT;

export type GenesisEquivalenceReadingFactFields = {
  readonly kind: GenesisEquivalenceReadingFactKind;
  readonly factKey: string;
  readonly fieldPath: string;
  readonly value: string;
  readonly boundary: GenesisEquivalenceBoundary | null;
};

/** Runtime-backed observer-visible fact used by genesis equivalence proofs. */
export default class GenesisEquivalenceReadingFact {
  readonly kind: GenesisEquivalenceReadingFactKind;
  readonly factKey: string;
  readonly fieldPath: string;
  readonly value: string;
  readonly boundary: GenesisEquivalenceBoundary | null;

  constructor(fields: GenesisEquivalenceReadingFactFields) {
    const checkedFields = requireFields(fields);
    this.kind = requireKind(checkedFields.kind);
    this.factKey = requireNonEmptyString(checkedFields.factKey, 'factKey');
    this.fieldPath = requireNonEmptyString(checkedFields.fieldPath, 'fieldPath');
    this.value = requireString(checkedFields.value, 'value');
    this.boundary = requireOptionalBoundary(checkedFields.boundary);
    Object.freeze(this);
  }

  /** Returns a deterministic identity key for this visible fact field. */
  toKey(): string {
    return `${this.kind}\0${this.factKey}\0${this.fieldPath}`;
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GenesisEquivalenceReadingFactFields | null | undefined,
): GenesisEquivalenceReadingFactFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GenesisEquivalenceReadingFact fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Validates the visible fact kind. */
function requireKind(kind: GenesisEquivalenceReadingFactKind): GenesisEquivalenceReadingFactKind {
  if (
    kind !== GENESIS_EQUIVALENCE_NODE_FACT
    && kind !== GENESIS_EQUIVALENCE_EDGE_FACT
    && kind !== GENESIS_EQUIVALENCE_PROPERTY_FACT
    && kind !== GENESIS_EQUIVALENCE_CONTENT_ATTACHMENT_FACT
  ) {
    throw new WarpError('GenesisEquivalenceReadingFact kind is unsupported', 'E_VALIDATION');
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

/** Requires a string value while allowing empty visible payload summaries. */
function requireString(value: string, name: string): string {
  if (typeof value !== 'string') {
    throw new WarpError(`${name} must be a string`, 'E_VALIDATION');
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
