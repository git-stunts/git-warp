/**
 * EffectPipeline — orchestrates effect emission, delivery through
 * sinks, and collection of delivery observations.
 *
 * Holds a sink (typically a MultiplexSink), an ExternalizationPolicy, and a
 * clock. Provides `emit()` to produce EffectEmissions and collect
 * DeliveryObservations.
 *
 * @module EffectPipeline
 * @see docs/design/effect-emission-v1.md
 */

import { createEffectEmission } from '../types/EffectEmission.js';

/**
 * @typedef {import('../types/EffectEmission.js').EffectEmission} EffectEmission
 * @typedef {import('../types/ExternalizationPolicy.js').ExternalizationPolicy} ExternalizationPolicy
 * @typedef {import('../types/DeliveryObservation.js').DeliveryObservation} DeliveryObservation
 * @typedef {import('../../ports/EffectSinkPort.js').default} EffectSinkPort
 */

/** @type {number} */
let _counter = 0;

/**
 * Generates a unique emission ID using the provided clock.
 *
 * @param {{ now: () => number }} clock
 * @returns {string}
 */
function generateId(clock) {
  _counter += 1;
  return `eff-${clock.now()}-${_counter}`;
}

/**
 * Builds the coordinate from optional emit() options.
 *
 * @param {{ writer?: string | null, coordinate?: { frontier?: Record<string, string> | null, ceiling?: number | null } }} [options]
 * @returns {{ writer: string | null, coordinate: { frontier: Record<string, string> | null, ceiling: number | null } }}
 */
function resolveEmitOptions(options) {
  return {
    writer: (options && options.writer) ?? null,
    coordinate: {
      frontier: (options && options.coordinate && options.coordinate.frontier) ?? null,
      ceiling: (options && options.coordinate && options.coordinate.ceiling) ?? null,
    },
  };
}

export class EffectPipeline {
  /**
   * @param {{
   *   sink: EffectSinkPort,
   *   lens: Readonly<ExternalizationPolicy>,
   *   clock: { now: () => number }
   * }} options
   */
  constructor({ sink, lens, clock }) {
    /** @type {EffectSinkPort} */
    this._sink = sink;
    /** @type {Readonly<ExternalizationPolicy>} */
    this._lens = lens;
    /** @type {{ now: () => number }} */
    this._clock = clock;
    /** @type {EffectEmission[]} */
    this._emissions = [];
    /** @type {DeliveryObservation[]} */
    this._observations = [];
  }

  /** @returns {Readonly<ExternalizationPolicy>} */
  get lens() {
    return this._lens;
  }

  /** @param {Readonly<ExternalizationPolicy>} newLens */
  set lens(newLens) {
    this._lens = newLens;
  }

  /**
   * Returns a copy of the emission log.
   *
   * @returns {ReadonlyArray<EffectEmission>}
   */
  get emissions() {
    return [...this._emissions];
  }

  /**
   * Returns a copy of the observation log.
   *
   * @returns {ReadonlyArray<DeliveryObservation>}
   */
  get observations() {
    return [...this._observations];
  }

  /**
   * Emits an effect and delivers it through the configured sink.
   *
   * @param {string} kind - Effect kind (generic string)
   * @param {unknown} payload - Opaque effect payload
   * @param {{
   *   writer?: string | null,
   *   coordinate?: { frontier?: Record<string, string> | null, ceiling?: number | null }
   * }} [options]
   * @returns {Promise<{ emission: EffectEmission, observations: DeliveryObservation | DeliveryObservation[] }>}
   */
  async emit(kind, payload, options) {
    const resolved = resolveEmitOptions(options);
    const emission = createEffectEmission({
      id: generateId(this._clock),
      kind,
      payload,
      timestamp: this._clock.now(),
      writer: resolved.writer,
      coordinate: resolved.coordinate,
    });

    this._emissions.push(emission);

    const observations = await this._sink.deliver(emission, this._lens);
    this._recordObservations(observations);

    return { emission, observations };
  }

  /**
   * @param {DeliveryObservation | DeliveryObservation[]} observations
   * @returns {void}
   */
  _recordObservations(observations) {
    if (Array.isArray(observations)) {
      for (const obs of observations) {
        this._observations.push(obs);
      }
    } else {
      this._observations.push(observations);
    }
  }
}
