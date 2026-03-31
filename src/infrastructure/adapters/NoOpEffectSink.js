/**
 * NoOpEffectSink — null/test sink that swallows effects.
 *
 * Returns 'delivered' in live mode, 'suppressed' in replay/inspect.
 *
 * @module NoOpEffectSink
 */

import EffectSinkPort from '../../ports/EffectSinkPort.js';
import { createDeliveryObservation } from '../../domain/types/DeliveryObservation.js';

/**
 * @typedef {import('../../domain/types/EffectEmission.js').EffectEmission} EffectEmission
 * @typedef {import('../../domain/types/ExternalizationPolicy.js').ExternalizationPolicy} ExternalizationPolicy
 */

export class NoOpEffectSink extends EffectSinkPort {
  /**
   * @param {{ id?: string }} [options]
   */
  constructor(options) {
    super();
    this._id = (options && options.id) || 'noop';
  }

  /** @returns {string} */
  get id() {
    return this._id;
  }

  /**
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
          outcome: 'suppressed',
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
        outcome: 'delivered',
        timestamp: Date.now(),
        lens,
      }),
    );
  }
}
