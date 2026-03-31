/**
 * ConsoleEffectSink — logs effect emissions to a logger.
 *
 * Suppresses output during replay/inspect (when suppressExternal is true).
 *
 * @module ConsoleEffectSink
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

/** Default sink ID for ConsoleEffectSink. */
export const CONSOLE_SINK_ID = 'console';

/**
 * Creates a suppressed observation when the lens blocks external delivery.
 *
 * @param {string} sinkId
 * @param {EffectEmission} emission
 * @param {ExternalizationPolicy} lens
 * @returns {import('../../domain/types/DeliveryObservation.js').DeliveryObservation}
 */
function buildSuppressedObservation(sinkId, emission, lens) {
  return createDeliveryObservation({
    emissionId: emission.id,
    sinkId,
    outcome: OUTCOME_SUPPRESSED,
    reason: `suppressed by ${lens.mode} lens`,
    timestamp: Date.now(),
    lens,
  });
}

/**
 * Resolves the sink ID from constructor options, falling back to the default.
 *
 * @param {{ id?: string }} [options]
 * @returns {string}
 */
function resolveSinkId(options) {
  if (options !== null && options !== undefined && typeof options.id === 'string' && options.id.length > 0) {
    return options.id;
  }
  return CONSOLE_SINK_ID;
}

/**
 * Resolves the logger from constructor options, falling back to null.
 *
 * @param {{ logger?: { info: (...args: unknown[]) => void } }} [options]
 * @returns {{ info: (...args: unknown[]) => void } | null}
 */
function resolveLogger(options) {
  if (options !== null && options !== undefined && options.logger !== undefined) {
    return options.logger;
  }
  return null;
}

export class ConsoleEffectSink extends EffectSinkPort {
  /**
   * Constructs a console sink with an optional logger and custom identifier.
   *
   * @param {{ logger?: { info: (...args: unknown[]) => void }, id?: string }} [options]
   */
  constructor(options) {
    super();
    this._id = resolveSinkId(options);
    this._logger = resolveLogger(options);
  }

  /**
   * Returns the unique identifier for this console sink.
   *
   * @returns {string}
   */
  get id() {
    return this._id;
  }

  /**
   * Logs the emission via the configured logger (if any) and returns a delivery observation. Suppresses output when the lens blocks external delivery.
   *
   * @param {EffectEmission} emission
   * @param {ExternalizationPolicy} lens
   * @returns {Promise<import('../../domain/types/DeliveryObservation.js').DeliveryObservation>}
   */
  deliver(emission, lens) {
    if (lens.suppressExternal) {
      return Promise.resolve(buildSuppressedObservation(this._id, emission, lens));
    }

    if (this._logger !== null) {
      this._logger.info(`[effect:${emission.kind}]`, emission.id, emission.payload);
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
