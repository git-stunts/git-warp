/**
 * ConsoleEffectSink — logs effect emissions to a logger.
 *
 * Suppresses output during replay/inspect (when suppressExternal is true).
 *
 * @module ConsoleEffectSink
 */

import EffectSinkPort from '../../ports/EffectSinkPort.js';
import { createDeliveryObservation } from '../../domain/types/DeliveryObservation.js';

/**
 * @typedef {import('../../domain/types/EffectEmission.js').EffectEmission} EffectEmission
 * @typedef {import('../../domain/types/ExternalizationPolicy.js').ExternalizationPolicy} ExternalizationPolicy
 */

export class ConsoleEffectSink extends EffectSinkPort {
  /**
   * @param {{ logger?: { info: (...args: unknown[]) => void }, id?: string }} [options]
   */
  constructor(options) {
    super();
    this._id = (options && options.id) || 'console';
    this._logger = (options && options.logger) || null;
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

    if (this._logger) {
      this._logger.info(
        `[effect:${emission.kind}]`,
        emission.id,
        emission.payload,
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
