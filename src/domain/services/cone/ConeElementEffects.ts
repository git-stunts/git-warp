import type EdgePropSet from '../../types/ops/EdgePropSet.ts';
import type NodePropSet from '../../types/ops/NodePropSet.ts';
import type PropSet from '../../types/ops/PropSet.ts';
import ConeRecordError from '../../errors/ConeRecordError.ts';
import { isPropValue } from '../../types/PropValue.ts';
import type { EventId } from '../../utils/EventId.ts';
import ConeConcurrentValue from './ConeConcurrentValue.ts';
import ConeElementEffect from './ConeElementEffect.ts';
import ConeLifecycleEvent, { type ConeLifecycleRole } from './ConeLifecycleEvent.ts';
import ConeObservation from './ConeObservation.ts';

/**
 * The effects one patch has on the elements of one family (nodes or edges),
 * collected in operation order so each element keeps its last write per
 * register and its last lifecycle effect (#1039).
 */
export default class ConeElementEffects {
  readonly #observation: ConeObservation;
  readonly #effects = new Map<string, ConeElementEffect>();

  constructor(observation: ConeObservation) {
    if (!(observation instanceof ConeObservation)) {
      throw new ConeRecordError('Cone element effects need a causal observation');
    }
    this.#observation = observation;
    Object.freeze(this);
  }

  /** The element's effect, or null when the patch has none on it. */
  of(element: string): ConeElementEffect | null {
    return this.#effects.get(element) ?? null;
  }

  lifecycle(element: string, effect: { readonly event: EventId; readonly role: ConeLifecycleRole }): void {
    this.#effects.set(element, this.#effect(element, effect));
  }

  /** A remove; one that observed no dot removed nothing and is not recorded. */
  remove(element: string, effect: { readonly event: EventId; readonly observedDots: readonly string[] }): void {
    if (effect.observedDots.length > 0) {
      this.lifecycle(element, { event: effect.event, role: 'remove' });
    }
  }

  /** A property write: the register's newest write in this patch, and an edit of the element. */
  write(element: string, effect: { readonly op: NodePropSet | EdgePropSet | PropSet; readonly event: EventId }): void {
    const { value, key } = effect.op;
    const edited = this.#effect(element, { event: effect.event, role: 'edit' });
    const next = isPropValue(value)
      ? edited.withWrite(key, new ConeConcurrentValue({ event: effect.event, value, causal: this.#observation.causal }))
      : edited;
    this.#effects.set(element, next);
  }

  #effect(element: string, effect: { readonly event: EventId; readonly role: ConeLifecycleRole }): ConeElementEffect {
    const lifecycle = new ConeLifecycleEvent({ ...effect, causal: this.#observation.causal });
    const existing = this.#effects.get(element);
    return existing === undefined ? new ConeElementEffect(lifecycle) : existing.withLifecycle(lifecycle);
  }
}
