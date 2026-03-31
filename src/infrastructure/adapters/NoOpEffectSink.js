/**
 * NoOpEffectSink — null/test sink that swallows effects.
 *
 * Returns 'delivered' in live mode, 'suppressed' in replay/inspect.
 *
 * @module NoOpEffectSink
 */

import EffectSinkPort from '../../ports/EffectSinkPort.js';
import { createDeliveryObservation } from '../../domain/types/DeliveryObservation.js';
import {
  OUTCOME_DELIVERED,
  OUTCOME_SUPPRESSED,
} from '../../domain/types/ExternalizationPolicy.js';

/**
 * @typedef {import('../../domain/types/EffectEmission.js').EffectEmission} EffectEmission
 * @typedef {import('../../domain/types/ExternalizationPolicy.js').ExternalizationPolicy} ExternalizationPolicy
 */

/** Default sink ID for NoOpEffectSink. */
export const NOOP_SINK_ID = 'noop';

export class NoOpEffectSink extends EffectSinkPort {
  /**
   * Constructs a no-op sink with an optional custom identifier.
   *
   * @param {{ id?: string }} [options]
   */
  constructor(options) {
    super();
    this._id = (options !== null && options !== undefined && options.id !== undefined && options.id !== '') ? options.id : NOOP_SINK_ID;
  }

  /**
   * Returns the unique identifier for this no-op sink.
   *
   * @returns {string}
   */
  get id() {
    return this._id;
  }

  /**
   * Swallows the emission without side effects, returning a 'delivered' or 'suppressed' observation based on the lens.
   *
   * @param {EffectEmission} emission
   * @param {ExternalizationPolicy} lens
   * @returns {Promise<import('../../domain/types/DeliveryObservation.js').DeliveryObservation>}
   */
  deliver(emission, lens) {
    if (lens.suppressExternal) {
      return Promise.resolve(
        createDeliveryObservation({
          emissionId: emission.id,
          sinkId: this._id,
          outcome: OUTCOME_SUPPRESSED,
          reason: `suppressed by ${lens.mode} lens`,
          timestamp: Date.now(),
          lens,
        }),
      );
    }
    return Promise.resolve(
      createDeliveryObservation({
        emissionId: emission.id,
        sinkId: this._id,
        outcome: OUTCOME_DELIVERED,
        timestamp: Date.now(),
        lens,
      }),
    );
  }
}
