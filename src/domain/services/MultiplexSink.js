/**
 * MultiplexSink — fans out one EffectEmission to multiple child sinks.
 *
 * Implements EffectSinkPort itself (composite pattern), so callers
 * don't need to know whether they're talking to one sink or many.
 *
 * @module MultiplexSink
 * @see docs/design/effect-emission-v1.md
 */

import EffectSinkPort from '../../ports/EffectSinkPort.js';

/**
 * @typedef {import('../types/EffectEmission.js').EffectEmission} EffectEmission
 * @typedef {import('../types/ExternalizationPolicy.js').ExternalizationPolicy} ExternalizationPolicy
 * @typedef {import('../types/DeliveryObservation.js').DeliveryObservation} DeliveryObservation
 */

export class MultiplexSink extends EffectSinkPort {
  /**
   * @param {{ id?: string }} [options]
   */
  constructor(options) {
    super();
    this._id = (options && options.id) || 'multiplex';
    /** @type {EffectSinkPort[]} */
    this._sinks = [];
  }

  /** @returns {string} */
  get id() {
    return this._id;
  }

  /**
   * Returns a shallow copy of the registered sinks.
   *
   * @returns {ReadonlyArray<EffectSinkPort>}
   */
  get sinks() {
    return [...this._sinks];
  }

  /**
   * Registers a child sink. Rejects duplicate IDs.
   *
   * @param {EffectSinkPort} sink
   * @returns {void}
   */
  addSink(sink) {
    if (this._sinks.some((s) => s.id === sink.id)) {
      throw new Error(`duplicate sink id: ${sink.id}`);
    }
    this._sinks.push(sink);
  }

  /**
   * Removes a child sink by ID.
   *
   * @param {string} sinkId
   * @returns {boolean} true if removed, false if not found
   */
  removeSink(sinkId) {
    const before = this._sinks.length;
    this._sinks = this._sinks.filter((s) => s.id !== sinkId);
    return this._sinks.length < before;
  }

  /**
   * Delivers an emission to all child sinks and collects observations.
   *
   * @param {EffectEmission} emission
   * @param {ExternalizationPolicy} lens
   * @returns {Promise<DeliveryObservation[]>}
   */
  async deliver(emission, lens) {
    /** @type {DeliveryObservation[]} */
    const observations = [];
    for (const sink of this._sinks) {
      const obs = await sink.deliver(emission, lens);
      observations.push(obs);
    }
    return observations;
  }
}
