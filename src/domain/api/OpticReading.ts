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

function validateKeyAndPresence(key: string | null, present: boolean): void {
  if (key !== null && typeof key !== 'string') {
    throw new OpticError('An optic reading key must be a string or null');
  }
  if (typeof present !== 'boolean') {
    throw new OpticError('An optic reading present indicator must be a boolean');
  }
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
    validateKeyAndPresence(fields.key, fields.present);
    this.subject = fields.subject;
    this.key = fields.key;
    this.present = fields.present;
    this.value = fields.value;
    Object.freeze(this);
  }
}
