import ConeRecordError from '../../errors/ConeRecordError.ts';
import { compareStrings } from '../../utils/StringComparison.ts';
import type ConeConcurrentValue from './ConeConcurrentValue.ts';
import ConeConcurrentSet from './ConeConcurrentSet.ts';
import type ConeLifecycleEvent from './ConeLifecycleEvent.ts';
import type ConeObservation from './ConeObservation.ts';
import { requireIdentity } from './ConeRecordValidation.ts';

/**
 * The concurrent events one node or edge retains (#1039): per property key
 * the register's concurrent writes, and the element's concurrent lifecycle
 * effects (removes against adds and edits). The LWW winner of each register
 * stays in the record's registers exactly as the reducer chose it; these sets
 * only say which other writes raced it.
 */
export default class ConeConcurrency {
  readonly registers: ReadonlyMap<string, ConeConcurrentSet<ConeConcurrentValue>>;
  readonly lifecycle: ConeConcurrentSet<ConeLifecycleEvent>;

  constructor(fields: {
    readonly registers: ReadonlyMap<string, ConeConcurrentSet<ConeConcurrentValue>>;
    readonly lifecycle: ConeConcurrentSet<ConeLifecycleEvent>;
  }) {
    this.registers = requireRegisterSets(fields.registers);
    if (!(fields.lifecycle instanceof ConeConcurrentSet)) {
      throw new ConeRecordError('Cone concurrency lifecycle must be a concurrent set');
    }
    this.lifecycle = fields.lifecycle;
    Object.freeze(this);
  }

  static empty(): ConeConcurrency {
    return new ConeConcurrency({ registers: new Map(), lifecycle: ConeConcurrentSet.empty() });
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
