import ConeRecordError from '../../errors/ConeRecordError.ts';
import { compareStrings } from '../../utils/StringComparison.ts';
import type ConeConcurrentValue from './ConeConcurrentValue.ts';
import ConeConcurrentSet from './ConeConcurrentSet.ts';
import type ConeLifecycleEvent from './ConeLifecycleEvent.ts';
import type ConeObservation from './ConeObservation.ts';
import { requireIdentity } from './ConeRecordValidation.ts';

/** The sets one element retains. */
export type ConeConcurrencySets = {
  readonly registers: ReadonlyMap<string, ConeConcurrentSet<ConeConcurrentValue>>;
  readonly lifecycle: ConeConcurrentSet<ConeLifecycleEvent>;
};

/** Which of an element's sets can hold a race, known without loading the sets. */
export type ConeConcurrencyHint = {
  /** Register keys whose set holds a second member or a counted eviction. */
  readonly racedKeys: readonly string[];
  /** Whether the lifecycle set holds a remove and an edit, or a counted eviction. */
  readonly lifecycleRaced: boolean;
};

/** Stored sets, decoded on first use, and the hint stored beside them. */
export type ConeDeferredConcurrency = {
  readonly hint: ConeConcurrencyHint;
  readonly load: () => ConeConcurrencySets;
};

/**
 * The concurrent events one node or edge retains (#1039): per property key
 * the register's concurrent writes, and the element's concurrent lifecycle
 * effects (removes against adds and edits). The LWW winner of each register
 * stays in the record's registers exactly as the reducer chose it; these sets
 * only say which other writes raced it.
 *
 * A stored record's sets load on first use. Its hint says which sets can hold
 * a race, so a Reading of a register nothing raced never decodes them.
 */
export default class ConeConcurrency {
  #sets: ConeConcurrencySets | null;
  readonly #load: () => ConeConcurrencySets;
  readonly #hint: ConeConcurrencyHint;

  constructor(fields: ConeConcurrencySets | ConeDeferredConcurrency) {
    if ('load' in fields) {
      this.#sets = null;
      this.#load = fields.load;
      this.#hint = Object.freeze({ racedKeys: Object.freeze([...fields.hint.racedKeys]), lifecycleRaced: fields.hint.lifecycleRaced });
    } else {
      const sets = requireSets(fields);
      this.#sets = sets;
      this.#load = () => sets;
      this.#hint = hintOf(sets);
    }
    Object.freeze(this);
  }

  static empty(): ConeConcurrency {
    return new ConeConcurrency({ registers: new Map(), lifecycle: ConeConcurrentSet.empty() });
  }

  get registers(): ReadonlyMap<string, ConeConcurrentSet<ConeConcurrentValue>> {
    return this.#loaded().registers;
  }

  get lifecycle(): ConeConcurrentSet<ConeLifecycleEvent> {
    return this.#loaded().lifecycle;
  }

  /** Which sets can hold a race, without loading them. */
  hint(): ConeConcurrencyHint {
    return this.#hint;
  }

  /** The concurrent writes of one register; empty when none was folded. */
  register(key: string): ConeConcurrentSet<ConeConcurrentValue> {
    return this.registers.get(key) ?? ConeConcurrentSet.empty();
  }

  /** This concurrency after folding one register write observed as `observation`. */
  withRegisterWrite(key: string, write: ConeConcurrentValue, observation: ConeObservation): ConeConcurrency {
    const registers = new Map(this.registers);
    registers.set(key, this.register(key).with(write, observation));
    return new ConeConcurrency({ registers, lifecycle: this.lifecycle });
  }

  /** This concurrency after folding one lifecycle effect observed as `observation`. */
  withLifecycleEvent(event: ConeLifecycleEvent, observation: ConeObservation): ConeConcurrency {
    return new ConeConcurrency({ registers: this.registers, lifecycle: this.lifecycle.with(event, observation) });
  }

  isEmpty(): boolean {
    return this.registers.size === 0 && this.lifecycle.isEmpty();
  }

  equals(other: ConeConcurrency): boolean {
    return other.lifecycle.equals(this.lifecycle) && other.registers.size === this.registers.size
      && [...other.registers].every(([key, set]) => this.registers.get(key)?.equals(set) === true);
  }

  #loaded(): ConeConcurrencySets {
    this.#sets ??= requireSets(this.#load());
    return this.#sets;
  }
}

function hintOf(sets: ConeConcurrencySets): ConeConcurrencyHint {
  const racedKeys = [...sets.registers].filter(([, set]) => set.members.length > 1 || set.overflow > 0).map(([key]) => key);
  const roles = new Set(sets.lifecycle.members.map((member) => member.role));
  return Object.freeze({
    racedKeys: Object.freeze(racedKeys),
    lifecycleRaced: roles.size > 1 || sets.lifecycle.overflow > 0,
  });
}

function requireSets(fields: ConeConcurrencySets): ConeConcurrencySets {
  if (!(fields.lifecycle instanceof ConeConcurrentSet)) {
    throw new ConeRecordError('Cone concurrency lifecycle must be a concurrent set');
  }
  return Object.freeze({ registers: requireRegisterSets(fields.registers), lifecycle: fields.lifecycle });
}

function requireRegisterSets(
  registers: ReadonlyMap<string, ConeConcurrentSet<ConeConcurrentValue>>,
): ReadonlyMap<string, ConeConcurrentSet<ConeConcurrentValue>> {
  if (!(registers instanceof Map)) {
    throw new ConeRecordError('Cone concurrency registers must be a Map');
  }
  for (const [key, set] of registers) {
    requireIdentity(key, 'register key');
    if (!(set instanceof ConeConcurrentSet)) {
      throw new ConeRecordError('Cone concurrency registers must hold concurrent sets', { context: { key } });
    }
  }
  return Object.freeze(new Map([...registers].sort(([left], [right]) => compareStrings(left, right))));
}
