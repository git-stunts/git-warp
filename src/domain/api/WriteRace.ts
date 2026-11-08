import WriteRaceError from '../errors/WriteRaceError.ts';
import type { PluralityCausality } from './PluralityCausality.ts';

type WriteRaceKind = 'register' | 'lifecycle';

/**
 * One concurrent write a published write left standing beside its own, never
 * observed by it. It names who raced, not what they wrote: a write's receipt
 * discloses no value its writer was not asked to read.
 */
export default class WriteRace {
  /** A concurrent value of one property, or a concurrent remove of an edited node. */
  readonly kind: WriteRaceKind;
  readonly subject: string;
  /** The raced property of a register race; a lifecycle race has none. */
  readonly key: string | null;
  readonly writers: readonly string[];
  /** Raced events no longer retained individually, so not named in `writers`. */
  readonly overflow: number;
  readonly causality: PluralityCausality;

  constructor(fields: {
    readonly kind: WriteRaceKind;
    readonly subject: string;
    readonly key: string | null;
    readonly writers: readonly string[];
    readonly overflow: number;
    readonly causality: PluralityCausality;
  }) {
    WriteRace.#requireKey(fields.kind, fields.key);
    WriteRace.#requireOverflow(fields.overflow);
    this.kind = fields.kind;
    this.subject = fields.subject;
    this.key = fields.key;
    this.writers = Object.freeze([...fields.writers]);
    this.overflow = fields.overflow;
    this.causality = fields.causality;
    Object.freeze(this);
  }

  static #requireKey(kind: WriteRaceKind, key: string | null): void {
    const named = kind === 'register' ? key !== null && key.length > 0 : key === null;
    if (!named) {
      throw new WriteRaceError('A register race names one property, and a lifecycle race names none');
    }
  }

  static #requireOverflow(overflow: number): void {
    if (!Number.isSafeInteger(overflow) || overflow < 0) {
      throw new WriteRaceError('A race counts its overflow as a non-negative safe integer');
    }
  }
}
