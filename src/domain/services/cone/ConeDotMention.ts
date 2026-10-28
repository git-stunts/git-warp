import { Dot } from '../../crdt/Dot.ts';
import ConeRecordError from '../../errors/ConeRecordError.ts';
import type { ConeDotSet } from './ConeRecordKey.ts';
import { requireIdentity } from './ConeRecordValidation.ts';

/** Whether an operation tagged an element with a dot or named it in a remove. */
export type ConeDotRole = 'owner' | 'remover';

/** One operation's claim of one dot for one element. */
export default class ConeDotMention {
  readonly set: ConeDotSet;
  readonly dot: Dot;
  readonly element: string;
  readonly role: ConeDotRole;

  constructor(fields: {
    readonly set: ConeDotSet;
    readonly encodedDot: string;
    readonly element: string;
    readonly role: ConeDotRole;
  }) {
    if (fields.role !== 'owner' && fields.role !== 'remover') {
      throw new ConeRecordError(`Unknown cone dot role ${String(fields.role)}`);
    }
    this.set = fields.set;
    this.dot = Dot.decode(fields.encodedDot);
    this.element = requireIdentity(fields.element, 'element');
    this.role = fields.role;
    Object.freeze(this);
  }

  /** The encoded dot, as the OR-Sets store it. */
  encodedDot(): string {
    return Dot.encode(this.dot);
  }
}
