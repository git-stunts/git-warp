import ConeRecordError from '../../errors/ConeRecordError.ts';
import type ConeConcurrency from './ConeConcurrency.ts';
import ConeConcurrentValue from './ConeConcurrentValue.ts';
import ConeLifecycleEvent from './ConeLifecycleEvent.ts';
import type ConeObservation from './ConeObservation.ts';
import { requireIdentity } from './ConeRecordValidation.ts';

/** Immutable last writes and lifecycle effect of one patch on one element. */
export default class ConeElementEffect {
  readonly lifecycle: ConeLifecycleEvent;
  readonly #writes: ReadonlyMap<string, ConeConcurrentValue>;

  constructor(lifecycle: ConeLifecycleEvent, writes: ReadonlyMap<string, ConeConcurrentValue> = new Map()) {
    if (!(lifecycle instanceof ConeLifecycleEvent)) {
      throw new ConeRecordError('Cone element effect needs a lifecycle event');
    }
    this.lifecycle = lifecycle;
    this.#writes = validatedWrites(writes);
    Object.freeze(this);
  }

  withLifecycle(lifecycle: ConeLifecycleEvent): ConeElementEffect {
    return new ConeElementEffect(lifecycle, this.#writes);
  }

  withWrite(key: string, value: ConeConcurrentValue): ConeElementEffect {
    return new ConeElementEffect(this.lifecycle, new Map([...this.#writes, [key, value]]));
  }

  /** This patch's last admitted write to one register, for source identity validation. */
  value(key: string): ConeConcurrentValue | null {
    return this.#writes.get(key) ?? null;
  }

  /** Applies the completed effect under its patch's causal observation. */
  appliedTo(concurrency: ConeConcurrency, observation: ConeObservation): ConeConcurrency {
    let next = concurrency;
    for (const [key, write] of this.#writes) {
      next = next.withRegisterWrite(key, write, observation);
    }
    return next.withLifecycleEvent(this.lifecycle, observation);
  }
}

function validatedWrites(writes: ReadonlyMap<string, ConeConcurrentValue>): ReadonlyMap<string, ConeConcurrentValue> {
  if (!(writes instanceof Map)) {
    throw new ConeRecordError('Cone element effect needs a register write map');
  }
  for (const [key, value] of writes) {
    requireIdentity(key, 'property key');
    if (!(value instanceof ConeConcurrentValue)) {
      throw new ConeRecordError('Cone element writes must be concurrent values');
    }
  }
  return new Map(writes);
}
