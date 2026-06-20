import QueryError from '../../errors/QueryError.ts';

export type ObserverEmissionFields = {
  readonly basis: readonly string[];
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly propertyKeys: readonly string[];
  readonly matchedBasis: readonly string[];
};

/** Immutable emission map output for a structural observer accumulation. */
export default class ObserverEmission {
  readonly basis: readonly string[];
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly propertyKeys: readonly string[];
  readonly matchedBasis: readonly string[];

  constructor(fields: ObserverEmissionFields) {
    const checked = requireFields(fields);
    this.basis = freezeStringList(checked.basis, 'basis');
    this.nodeCount = requireNonNegativeInteger(checked.nodeCount, 'nodeCount');
    this.edgeCount = requireNonNegativeInteger(checked.edgeCount, 'edgeCount');
    this.propertyKeys = freezeStringList(checked.propertyKeys, 'propertyKeys');
    this.matchedBasis = freezeStringList(checked.matchedBasis, 'matchedBasis');
    Object.freeze(this);
  }
}

function requireFields(
  fields: ObserverEmissionFields | null | undefined,
): ObserverEmissionFields {
  if (fields !== null && typeof fields === 'object') {
    return fields;
  }
  throw new QueryError('observer emission requires object fields', {
    code: 'E_OBSERVER_EMISSION_FIELDS',
  });
}

function freezeStringList(values: readonly string[], field: string): readonly string[] {
  if (!Array.isArray(values)) {
    throw new QueryError('observer emission field must be a string array', {
      code: 'E_OBSERVER_EMISSION_FIELD',
      context: { field },
    });
  }
  const normalized: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new QueryError('observer emission field entries must be non-empty strings', {
        code: 'E_OBSERVER_EMISSION_FIELD',
        context: { field },
      });
    }
    normalized.push(value);
  }
  return Object.freeze(normalized);
}

function requireNonNegativeInteger(value: number, field: string): number {
  if (Number.isInteger(value) && value >= 0) {
    return value;
  }
  throw new QueryError('observer emission counts must be non-negative integers', {
    code: 'E_OBSERVER_EMISSION_COUNT',
    context: { field },
  });
}
