/**
 * EffectPipeline — host-domain infrastructure for managed outbound
 * delivery.
 *
 * Orchestrates emission through sinks and collects delivery
 * observations. This is NOT substrate — it operates entirely
 * outside the graph. The graph provides effect entities (written by
 * participants); the pipeline externalizes them.
 *
 * @module EffectPipeline
 * @see docs/design/layer-boundary.md
 */

import { createEffectEmission } from '../types/EffectEmission.js';

/**
 * @typedef {import('../types/EffectEmission.js').EffectEmission} EffectEmission
 * @typedef {import('../types/ExternalizationPolicy.js').ExternalizationPolicy} ExternalizationPolicy
 * @typedef {import('../types/DeliveryObservation.js').DeliveryObservation} DeliveryObservation
 * @typedef {import('../../ports/EffectSinkPort.js').default} EffectSinkPort
 */

/** Prefix for auto-generated emission IDs. */
const EMISSION_ID_PREFIX = 'eff-';

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
  return `${EMISSION_ID_PREFIX}${clock.now()}-${_counter}`;
}

/** @type {{ frontier: Record<string, string> | null, ceiling: number | null }} */
const NULL_COORDINATE = { frontier: null, ceiling: null };

/**
 * Extracts the writer from emit options, defaulting to null.
 *
 * @param {{ writer?: string | null }} [options]
 * @returns {string | null}
 */
function resolveWriter(options) {
  return options?.writer ?? null;
}

/**
 * Normalizes a raw coordinate object, defaulting undefined fields to null.
 *
 * @param {{ frontier?: Record<string, string> | null, ceiling?: number | null }} coord
 * @returns {{ frontier: Record<string, string> | null, ceiling: number | null }}
 */
function normalizeCoordinate(coord) {
  return {
    frontier: coord.frontier ?? null,
    ceiling: coord.ceiling ?? null,
  };
}

/**
 * Extracts the coordinate from emit options, defaulting to null frontier and ceiling.
 *
 * @param {{ coordinate?: { frontier?: Record<string, string> | null, ceiling?: number | null } }} [options]
 * @returns {{ frontier: Record<string, string> | null, ceiling: number | null }}
 */
function resolveCoordinate(options) {
  const coord = options?.coordinate ?? null;
  if (coord === null) {
    return NULL_COORDINATE;
  }
  return normalizeCoordinate(coord);
}

export class EffectPipeline {
  /**
   * Constructs a pipeline bound to a delivery sink, an externalization lens, and a clock source.
   *
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

  /**
   * Returns the current externalization policy governing delivery behavior.
   *
   * @returns {Readonly<ExternalizationPolicy>}
   */
  get lens() {
    return this._lens;
  }

  /**
   * Replaces the externalization policy for subsequent deliveries.
   *
   * @param {Readonly<ExternalizationPolicy>} newLens
   */
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
    const emission = createEffectEmission({
      id: generateId(this._clock),
      kind,
      payload,
      timestamp: this._clock.now(),
      writer: resolveWriter(options),
      coordinate: resolveCoordinate(options),
    });

    this._emissions.push(emission);

    const observations = await this._sink.deliver(emission, this._lens);
    this._recordObservations(observations);

    return { emission, observations };
  }

  /**
   * Appends one or more delivery observations to the internal observation log.
   *
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
