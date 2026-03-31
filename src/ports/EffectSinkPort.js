import WarpError from '../domain/errors/WarpError.js';

/**
 * Port interface for effect delivery sinks.
 *
 * Each sink has a unique `id` and a `deliver()` method that accepts
 * an EffectEmission and an ExternalizationPolicy. The sink decides
 * its behavior based on the policy (e.g., suppress during replay)
 * and returns a DeliveryObservation recording the outcome.
 *
 * This is a host-domain port for externalization, not a substrate
 * contract. Sinks operate outside the graph.
 *
 * @abstract
 * @see docs/design/layer-boundary.md
 */
export default class EffectSinkPort {
  /**
   * Unique identifier for this sink. Subclasses must override this getter.
   *
   * @type {string}
   * @abstract
   */
  get id() {
    throw new WarpError('EffectSinkPort.id not implemented', 'E_PORT_NOT_IMPLEMENTED');
  }

  /**
   * Delivers an effect emission under the given delivery lens. Subclasses must override this method.
   *
   * @param {import('../domain/types/EffectEmission.js').EffectEmission} _emission
   * @param {import('../domain/types/ExternalizationPolicy.js').ExternalizationPolicy} _lens
   * @returns {Promise<import('../domain/types/DeliveryObservation.js').DeliveryObservation>}
   * @abstract
   */
  async deliver(_emission, _lens) {
    throw new WarpError('EffectSinkPort.deliver() not implemented', 'E_PORT_NOT_IMPLEMENTED');
  }
}
