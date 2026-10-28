import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import ConcurrentValue from './ConcurrentValue.ts';
import type { PluralityCausality } from './PluralityCausality.ts';

type RegisterPluralityFields = Readonly<{
  subject: string;
  key: string;
  winner: ConcurrentValue;
  siblings: readonly ConcurrentValue[];
  overflow: number;
  causality: PluralityCausality;
}>;

/**
 * A register whose value raced other writes (#1039): the Reading's value is
 * still the LWW `winner`, and `siblings` are the concurrent values it hides,
 * each with its writer. `overflow` counts concurrent values past the retained
 * bound that are only counted. `causality` is `underdetermined` when a
 * sibling's patch recorded no causal evidence, so the race may be an artefact
 * of missing history rather than a real one.
 */
export default class RegisterPlurality {
  readonly kind: 'register' = 'register';
  readonly subject: string;
  readonly key: string;
  readonly winner: ConcurrentValue;
  readonly siblings: readonly ConcurrentValue[];
  readonly overflow: number;
  readonly causality: PluralityCausality;

  constructor(fields: RegisterPluralityFields) {
    requireNonEmptyString(fields.subject, 'registerPlurality.subject');
    requireNonEmptyString(fields.key, 'registerPlurality.key');
    if (!(fields.winner instanceof ConcurrentValue) || !fields.siblings.every((sibling) => sibling instanceof ConcurrentValue)) {
      throw new WarpError('Register plurality needs concurrent values', 'E_PLURALITY');
    }
    if (fields.siblings.length + fields.overflow === 0) {
      throw new WarpError('Register plurality needs at least one concurrent sibling', 'E_PLURALITY');
    }
    this.subject = fields.subject;
    this.key = fields.key;
    this.winner = fields.winner;
    this.siblings = Object.freeze([...fields.siblings]);
    this.overflow = fields.overflow;
    this.causality = fields.causality;
    Object.freeze(this);
  }
}
