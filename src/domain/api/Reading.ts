import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';

const PROPERTY_GET: 'property.get' = 'property.get';
const NODE_EXISTS: 'node.exists' = 'node.exists';
const NEIGHBORHOOD: 'neighborhood' = 'neighborhood';
const READING_DIRECTIONS: ReadonlySet<ReadingDirection> = new Set(['out', 'in', 'both']);

export type ReadingKind = 'property.get' | 'node.exists' | 'neighborhood';

export type ReadingDirection = 'out' | 'in' | 'both';

export type PropertyReadingFields = {
  readonly subject: string;
  readonly key: string;
};

export type NodeReadingFields = {
  readonly subject: string;
};

export type NeighborhoodReadingFields = {
  readonly subject: string;
  readonly direction?: ReadingDirection;
  readonly labels?: readonly string[];
  readonly limit?: number;
  readonly cursor?: string;
};

export type ReadingDescriptor =
  | (PropertyReadingFields & { readonly kind: 'property.get' })
  | (NodeReadingFields & { readonly kind: 'node.exists' })
  | (NeighborhoodReadingFields & { readonly kind: 'neighborhood' });

type MutableNeighborhoodDescriptor = {
  kind: 'neighborhood';
  subject: string;
  direction?: ReadingDirection;
  labels?: readonly string[];
  limit?: number;
  cursor?: string;
};

export default class Reading {
  readonly #descriptor: ReadingDescriptor;

  constructor(descriptor: ReadingDescriptor | null | undefined) {
    this.#descriptor = normalizeDescriptor(descriptor);
    Object.freeze(this);
  }

  static property(fields: PropertyReadingFields): Reading {
    return new Reading(propertyDescriptor(fields));
  }

  static nodeExists(fields: NodeReadingFields): Reading {
    return new Reading(nodeExistsDescriptor(fields));
  }

  static neighborhood(fields: NeighborhoodReadingFields): Reading {
    return new Reading(neighborhoodDescriptor(fields));
  }

  get kind(): ReadingKind {
    return this.#descriptor.kind;
  }

  get descriptor(): ReadingDescriptor {
    return this.#descriptor;
  }
}

function normalizeDescriptor(descriptor: ReadingDescriptor | null | undefined): ReadingDescriptor {
  return normalizeKnownDescriptor(requireDescriptor(descriptor));
}

function requireDescriptor(descriptor: ReadingDescriptor | null | undefined): ReadingDescriptor {
  if (descriptor === null || descriptor === undefined) {
    throw new WarpError('Reading descriptor is required', 'E_READING_DESCRIPTOR');
  }
  return descriptor;
}

function normalizeKnownDescriptor(descriptor: ReadingDescriptor): ReadingDescriptor {
  if (descriptor.kind === PROPERTY_GET) {
    return propertyDescriptor(descriptor);
  }
  if (descriptor.kind === NODE_EXISTS) {
    return nodeExistsDescriptor(descriptor);
  }
  if (descriptor.kind === NEIGHBORHOOD) {
    return neighborhoodDescriptor(descriptor);
  }
  throw new WarpError('Reading kind is unsupported', 'E_READING_KIND');
}

function propertyDescriptor(fields: PropertyReadingFields): ReadingDescriptor {
  const checkedFields = requireReadingFields(fields);
  requireNonEmptyString(checkedFields.subject, 'reading.subject');
  requireNonEmptyString(checkedFields.key, 'reading.key');
  return Object.freeze({
    kind: PROPERTY_GET,
    subject: checkedFields.subject,
    key: checkedFields.key,
  });
}

function nodeExistsDescriptor(fields: NodeReadingFields): ReadingDescriptor {
  const checkedFields = requireReadingFields(fields);
  requireNonEmptyString(checkedFields.subject, 'reading.subject');
  return Object.freeze({
    kind: NODE_EXISTS,
    subject: checkedFields.subject,
  });
}

function neighborhoodDescriptor(fields: NeighborhoodReadingFields): ReadingDescriptor {
  const checkedFields = requireReadingFields(fields);
  requireNonEmptyString(checkedFields.subject, 'reading.subject');
  validateNeighborhoodCursor(checkedFields.cursor);
  validateNeighborhoodDirection(checkedFields.direction);
  validateNeighborhoodLimit(checkedFields.limit);
  const labels = freezeNeighborhoodLabels(checkedFields.labels);
  const descriptor: MutableNeighborhoodDescriptor = {
    kind: NEIGHBORHOOD,
    subject: checkedFields.subject,
  };
  assignNeighborhoodOptions(descriptor, checkedFields, labels);
  return Object.freeze(descriptor);
}

function assignNeighborhoodOptions(
  descriptor: MutableNeighborhoodDescriptor,
  fields: NeighborhoodReadingFields,
  labels: readonly string[] | undefined
): void {
  if (fields.direction !== undefined) {
    descriptor.direction = fields.direction;
  }
  if (labels !== undefined) {
    descriptor.labels = labels;
  }
  if (fields.limit !== undefined) {
    descriptor.limit = fields.limit;
  }
  if (fields.cursor !== undefined) {
    descriptor.cursor = fields.cursor;
  }
}

function validateNeighborhoodCursor(cursor: string | undefined): void {
  if (cursor !== undefined) {
    requireNonEmptyString(cursor, 'reading.cursor');
  }
}

function validateNeighborhoodDirection(direction: ReadingDirection | undefined): void {
  if (direction !== undefined && !READING_DIRECTIONS.has(direction)) {
    throw new WarpError('Reading neighborhood direction is unsupported', 'E_READING_DIRECTION');
  }
}

function validateNeighborhoodLimit(limit: number | undefined): void {
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new WarpError('Reading neighborhood limit must be a positive integer', 'E_READING_LIMIT');
  }
}

function freezeNeighborhoodLabels(
  labels: readonly string[] | undefined
): readonly string[] | undefined {
  if (labels === undefined) {
    return undefined;
  }
  return Object.freeze(
    labels.map((label) => {
      requireNonEmptyString(label, 'reading.label');
      return label;
    })
  );
}

function requireReadingFields<TFields>(fields: TFields | null | undefined): TFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('Reading fields are required', 'E_READING_FIELDS');
  }
  return fields;
}
