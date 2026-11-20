import OpticError from '../errors/OpticError.ts';
import type { OpticValue } from './OpticValue.ts';

type OpticReadingFields = {
  readonly subject: string;
  readonly key: string | null;
  readonly present: boolean;
  readonly value: OpticValue | null;
};

function validateSubject(subject: string): void {
  if (typeof subject !== 'string' || subject.length === 0) {
    throw new OpticError('An optic reading needs a non-empty subject');
  }
}

function validateKey(key: string | null): void {
  if (key !== null && !isNonEmptyString(key)) {
    throw new OpticError('An optic reading key must be a non-empty string or null');
  }
}

function validatePresenceAndValue(fields: OpticReadingFields): void {
  if (typeof fields.present !== 'boolean') {
    throw new OpticError('An optic reading present indicator must be a boolean');
  }
  if (requiresNullValue(fields) && fields.value !== null) {
    throw new OpticError('An optic reading for a node or absent property must have a null value');
  }
}

function requiresNullValue(fields: OpticReadingFields): boolean {
  return fields.key === null || !fields.present;
}

function isNonEmptyString(value: string): boolean {
  return typeof value === 'string' && value.length > 0;
}

/** One answer an Optic emitted: whether its subject is present, and the value when it is a property. */
export default class OpticReading {
  readonly subject: string;
  /** The property asked about, or null for a question about the node itself. */
  readonly key: string | null;
  readonly present: boolean;
  readonly value: OpticValue | null;

  constructor(fields: OpticReadingFields) {
    validateSubject(fields.subject);
    validateKey(fields.key);
    validatePresenceAndValue(fields);
    this.subject = fields.subject;
    this.key = fields.key;
    this.present = fields.present;
    this.value = fields.value;
    Object.freeze(this);
  }
}
