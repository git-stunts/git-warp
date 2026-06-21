import QueryError from '../../errors/QueryError.ts';
import ObserverBasis from './ObserverBasis.ts';
import ObserverEmission from './ObserverEmission.ts';
import type { QueryPropertyBag } from './QueryReadModelProvider.ts';

export type ObserverAccumulationFields = {
  readonly basis: ObserverBasis;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly propertyKeys: readonly string[];
};

/** Immutable accumulation state for a structural observer fold. */
export default class ObserverAccumulation {
  readonly basis: ObserverBasis;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly propertyKeys: readonly string[];

  constructor(fields: ObserverAccumulationFields) {
    const checked = requireFields(fields);
    this.basis = requireBasis(checked.basis);
    this.nodeCount = requireNonNegativeInteger(checked.nodeCount, 'nodeCount');
    this.edgeCount = requireNonNegativeInteger(checked.edgeCount, 'edgeCount');
    this.propertyKeys = freezeSortedKeys(checked.propertyKeys);
    Object.freeze(this);
  }

  static empty(basis: ObserverBasis): ObserverAccumulation {
    return new ObserverAccumulation({
      basis,
      nodeCount: 0,
      edgeCount: 0,
      propertyKeys: [],
    });
  }

  includeNode(props: QueryPropertyBag): ObserverAccumulation {
    return new ObserverAccumulation({
      basis: this.basis,
      nodeCount: this.nodeCount + 1,
      edgeCount: this.edgeCount,
      propertyKeys: mergePropertyKeys(this.propertyKeys, props),
    });
  }

  includeEdges(edgeCount: number): ObserverAccumulation {
    return new ObserverAccumulation({
      basis: this.basis,
      nodeCount: this.nodeCount,
      edgeCount: this.edgeCount + requireNonNegativeInteger(edgeCount, 'edgeCount'),
      propertyKeys: this.propertyKeys,
    });
  }

  emit(): ObserverEmission {
    return new ObserverEmission({
      basis: this.basis.distinctions,
      nodeCount: this.nodeCount,
      edgeCount: this.edgeCount,
      propertyKeys: this.propertyKeys,
      matchedBasis: this.basis.matchedBy(this.propertyKeys),
    });
  }
}

function requireFields(
  fields: ObserverAccumulationFields | null | undefined,
): ObserverAccumulationFields {
  if (fields !== null && typeof fields === 'object') {
    return fields;
  }
  throw new QueryError('observer accumulation requires object fields', {
    code: 'E_OBSERVER_ACCUMULATION_FIELDS',
  });
}

function requireBasis(basis: ObserverBasis): ObserverBasis {
  if (basis instanceof ObserverBasis) {
    return basis;
  }
  throw new QueryError('observer accumulation requires an ObserverBasis', {
    code: 'E_OBSERVER_ACCUMULATION_BASIS',
  });
}

function requireNonNegativeInteger(value: number, field: string): number {
  if (Number.isInteger(value) && value >= 0) {
    return value;
  }
  throw new QueryError('observer accumulation counts must be non-negative integers', {
    code: 'E_OBSERVER_ACCUMULATION_COUNT',
    context: { field },
  });
}

function mergePropertyKeys(
  existingKeys: readonly string[],
  props: QueryPropertyBag,
): readonly string[] {
  const merged = new Set(existingKeys);
  for (const key of Object.keys(props)) {
    merged.add(key);
  }
  return freezeSortedKeys([...merged]);
}

function freezeSortedKeys(keys: readonly string[]): readonly string[] {
  const normalized: string[] = [];
  for (const key of keys) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new QueryError('observer accumulation property keys must be non-empty strings', {
        code: 'E_OBSERVER_ACCUMULATION_PROPERTY_KEY',
        context: { field: 'propertyKeys' },
      });
    }
    normalized.push(key);
  }
  return Object.freeze([...new Set(normalized)].sort(compareStrings));
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
