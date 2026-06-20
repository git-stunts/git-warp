import type { EffectEmission } from '../domain/types/EffectEmission.ts';
import type { ExternalizationPolicy } from '../domain/types/ExternalizationPolicy.ts';
import type { DeliveryObservation } from '../domain/types/DeliveryObservation.ts';

/**
 * Port interface for effect delivery sinks.
 *
 * Each sink has a unique `id` and a `deliver()` method that accepts
 * an EffectEmission and an ExternalizationPolicy. The sink decides
 * its behavior based on the policy (e.g., suppress during replay)
 * and returns delivery observations recording the outcome.
 *
 * This is a host-domain port for externalization, not a substrate
 * contract. Sinks operate outside the graph.
 *
 * @see docs/design/layer-boundary.md
 */

/** Port for effect delivery sinks. */
export default abstract class EffectSinkPort {
  /** Unique identifier for this sink. */
  abstract get id(): string;

  /** Delivers an effect emission under the given delivery lens. */
  abstract deliver(
    _emission: EffectEmission,
    _lens: ExternalizationPolicy,
  ): Promise<DeliveryObservation[]>;
}
