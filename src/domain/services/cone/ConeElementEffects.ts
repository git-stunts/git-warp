import type EdgePropSet from '../../types/ops/EdgePropSet.ts';
import type NodePropSet from '../../types/ops/NodePropSet.ts';
import type PropSet from '../../types/ops/PropSet.ts';
import { isPropValue } from '../../types/PropValue.ts';
import type { EventId } from '../../utils/EventId.ts';
import ConeConcurrentValue from './ConeConcurrentValue.ts';
import ConeLifecycleEvent, { type ConeLifecycleRole } from './ConeLifecycleEvent.ts';

/** One patch's last effect on one element: its register writes by key and its lifecycle effect. */
export type ConeElementEffect = {
  readonly writes: Map<string, ConeConcurrentValue>;
  lifecycle: ConeLifecycleEvent | null;
};

/**
 * The effects one patch has on the elements of one family (nodes or edges),
 * collected in operation order so each element keeps its last write per
 * register and its last lifecycle effect (#1039).
 */
export default class ConeElementEffects {
  readonly #causal: boolean;
  readonly #effects = new Map<string, ConeElementEffect>();

  constructor(causal: boolean) {
    this.#causal = causal;
  }

  /** The element's effect, or null when the patch has none on it. */
  of(element: string): ConeElementEffect | null {
    return this.#effects.get(element) ?? null;
  }

  lifecycle(element: string, effect: { readonly event: EventId; readonly role: ConeLifecycleRole }): void {
    this.#effect(element).lifecycle = new ConeLifecycleEvent({ ...effect, causal: this.#causal });
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
    if (isPropValue(value)) {
      this.#effect(element).writes.set(key, new ConeConcurrentValue({ event: effect.event, value, causal: this.#causal }));
    }
    this.lifecycle(element, { event: effect.event, role: 'edit' });
  }

  #effect(element: string): ConeElementEffect {
    const existing = this.#effects.get(element);
    if (existing !== undefined) {
      return existing;
    }
    const created: ConeElementEffect = { writes: new Map(), lifecycle: null };
    this.#effects.set(element, created);
    return created;
  }
}
