import type { PluralityCausality } from './PluralityCausality.ts';

/**
 * One concurrent write a published write left standing beside its own, never
 * observed by it. It names who raced, not what they wrote: a write's receipt
 * discloses no value its writer was not asked to read.
 */
export default class WriteRace {
  /** A concurrent value of one property, or a concurrent remove of an edited node. */
  readonly kind: 'register' | 'lifecycle';
  readonly subject: string;
  /** The raced property, for a register race. */
  readonly key: string | null;
  readonly writers: readonly string[];
  /** Raced events no longer retained individually, so not named in `writers`. */
  readonly overflow: number;
  readonly causality: PluralityCausality;

  constructor(fields: {
    readonly kind: 'register' | 'lifecycle';
    readonly subject: string;
    readonly key: string | null;
    readonly writers: readonly string[];
    readonly overflow: number;
    readonly causality: PluralityCausality;
  }) {
    this.kind = fields.kind;
    this.subject = fields.subject;
    this.key = fields.key;
    this.writers = Object.freeze([...fields.writers]);
    this.overflow = fields.overflow;
    this.causality = fields.causality;
    Object.freeze(this);
  }
}
