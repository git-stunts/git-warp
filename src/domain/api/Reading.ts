import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';

const PROPERTY_GET: 'property.get' = 'property.get';
const NODE_EXISTS: 'node.exists' = 'node.exists';

export type ReadingKind =
  | 'property.get'
  | 'node.exists';

export type PropertyReadingFields = {
  readonly subject: string;
  readonly key: string;
};

export type NodeReadingFields = {
  readonly subject: string;
};

export type ReadingDescriptor =
  | (PropertyReadingFields & { readonly kind: 'property.get' })
  | (NodeReadingFields & { readonly kind: 'node.exists' });

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

function requireReadingFields<TFields>(fields: TFields | null | undefined): TFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('Reading fields are required', 'E_READING_FIELDS');
  }
  return fields;
}
