/**
 * Port interface for effect delivery sinks.
 *
 * Each sink has a unique `id` and a `deliver()` method that accepts
 * an EffectEmission and an ExternalizationPolicy. The sink decides its behavior
 * based on the lens (e.g., suppress delivery during replay) and
 * returns a DeliveryObservation recording the outcome.
 *
 * @abstract
 * @see docs/design/effect-emission-v1.md
 */
export default class EffectSinkPort {
  /**
   * Unique identifier for this sink.
   *
   * @type {string}
   * @abstract
   */
  get id() {
    throw new Error('EffectSinkPort.id not implemented');
  }

  /**
   * Delivers an effect emission under the given delivery lens.
   *
   * @param {import('../domain/types/EffectEmission.js').EffectEmission} _emission
   * @param {import('../domain/types/ExternalizationPolicy.js').ExternalizationPolicy} _lens
   * @returns {Promise<import('../domain/types/DeliveryObservation.js').DeliveryObservation>}
   * @abstract
   */
  async deliver(_emission, _lens) {
    throw new Error('EffectSinkPort.deliver() not implemented');
  }
}
