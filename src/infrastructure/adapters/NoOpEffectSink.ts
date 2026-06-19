/**
 * NoOpEffectSink — null/test sink that swallows effects.
 *
 * Returns 'delivered' in live mode, 'suppressed' in replay/inspect.
 *
 * @module NoOpEffectSink
 */

import EffectSinkPort from '../../ports/EffectSinkPort.ts';
import { createDeliveryObservation, type DeliveryObservation } from '../../domain/types/DeliveryObservation.ts';
import type { EffectEmission } from '../../domain/types/EffectEmission.ts';
import {
  OUTCOME_DELIVERED,
  OUTCOME_SUPPRESSED,
  type ExternalizationPolicy,
} from '../../domain/types/ExternalizationPolicy.ts';

/** Default sink ID for NoOpEffectSink. */
const NOOP_SINK_ID = 'noop';

export class NoOpEffectSink extends EffectSinkPort {
  private readonly _id: string;

  constructor(options?: { id?: string }) {
    super();
    this._id = (options !== null && options !== undefined && options.id !== undefined && options.id !== '') ? options.id : NOOP_SINK_ID;
  }

  get id(): string {
    return this._id;
  }

  deliver(emission: EffectEmission, lens: ExternalizationPolicy): Promise<DeliveryObservation[]> {
    if (lens.suppressExternal) {
      return Promise.resolve(
        [createDeliveryObservation({
          emissionId: emission.id,
          sinkId: this._id,
          outcome: OUTCOME_SUPPRESSED,
          reason: `suppressed by ${lens.mode} lens`,
          timestamp: Date.now(),
          lens,
        })],
      );
    }
    return Promise.resolve(
      [createDeliveryObservation({
        emissionId: emission.id,
        sinkId: this._id,
        outcome: OUTCOME_DELIVERED,
        timestamp: Date.now(),
        lens,
      })],
    );
  }
}
