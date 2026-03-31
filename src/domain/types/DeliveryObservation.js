/**
 * DeliveryObservation — host-domain trace record of how a sink
 * handled an emitted effect under a given externalization policy.
 *
 * This is host-domain infrastructure, NOT causal substrate truth.
 * Delivery observations live in the pipeline's in-memory trace or
 * in chunk sink files — not in the graph.
 *
 * @module DeliveryObservation
 * @see docs/design/layer-boundary.md
 */

import { validateOutcome, DELIVERY_MODES } from './ExternalizationPolicy.js';

const modeSet = new Set(DELIVERY_MODES);

// ============================================================================
// Types
// ============================================================================

/**
 * @typedef {import('./ExternalizationPolicy.js').ExternalizationPolicy} ExternalizationPolicy
 */

/**
 * @typedef {Object} DeliveryObservation
 * @property {string} emissionId - Links to the EffectEmission
 * @property {string} sinkId - Which sink/adapter handled it
 * @property {'delivered' | 'suppressed' | 'failed' | 'skipped'} outcome
 * @property {string | undefined} reason - Why (e.g., "replay mode")
 * @property {number} timestamp - Wall-clock milliseconds
 * @property {Readonly<ExternalizationPolicy>} lens - Execution context at delivery time
 */

// ============================================================================
// Validation
// ============================================================================

/**
 * Asserts that a value is a non-empty string, throwing if it is not.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {void}
 */
function requireNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

/**
 * Asserts that a value is a non-negative finite number suitable for a wall-clock timestamp.
 *
 * @param {unknown} value
 * @returns {void}
 */
function validateTimestamp(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('timestamp must be a non-negative finite number');
  }
}

/**
 * Asserts that a lens is a valid ExternalizationPolicy shape with a recognized mode and boolean suppressExternal.
 *
 * @param {unknown} lens
 * @returns {void}
 */
function validateLens(lens) {
  if (lens === null || lens === undefined || typeof lens !== 'object') {
    throw new Error('lens must be an object');
  }
  const l = /** @type {Record<string, unknown>} */ (lens);
  validateLensFields(l);
}

/**
 * Validates the individual fields of a lens object after the object guard has passed.
 *
 * @param {Record<string, unknown>} l
 * @returns {void}
 */
function validateLensFields(l) {
  if (typeof l.mode !== 'string' || !modeSet.has(l.mode)) {
    throw new Error(
      `lens.mode must be one of: ${DELIVERY_MODES.join(', ')}`,
    );
  }
  if (typeof l.suppressExternal !== 'boolean') {
    throw new Error('lens.suppressExternal must be a boolean');
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Freezes a lens into an immutable ExternalizationPolicy snapshot.
 *
 * @param {{ mode: string, suppressExternal: boolean }} lens
 * @returns {Readonly<ExternalizationPolicy>}
 */
function freezeLens(lens) {
  return Object.freeze({
    mode: /** @type {'live' | 'replay' | 'inspect'} */ (lens.mode),
    suppressExternal: lens.suppressExternal,
  });
}

/**
 * Creates an immutable DeliveryObservation from validated parameters.
 *
 * @param {{
 *   emissionId: string,
 *   sinkId: string,
 *   outcome: string,
 *   reason?: string,
 *   timestamp: number,
 *   lens: { mode: string, suppressExternal: boolean }
 * }} params
 * @returns {Readonly<DeliveryObservation>}
 */
export function createDeliveryObservation({
  emissionId,
  sinkId,
  outcome,
  reason,
  timestamp,
  lens,
}) {
  requireNonEmptyString(emissionId, 'emissionId');
  requireNonEmptyString(sinkId, 'sinkId');
  validateOutcome(outcome);
  validateTimestamp(timestamp);
  validateLens(lens);

  /** @type {{ emissionId: string, sinkId: string, outcome: 'delivered' | 'suppressed' | 'failed' | 'skipped', timestamp: number, lens: Readonly<ExternalizationPolicy>, reason?: string }} */
  const obs = {
    emissionId,
    sinkId,
    outcome: /** @type {'delivered' | 'suppressed' | 'failed' | 'skipped'} */ (outcome),
    timestamp,
    lens: freezeLens(lens),
  };

  if (reason !== undefined) {
    obs.reason = reason;
  }

  return Object.freeze(obs);
}

// ============================================================================
// Canonical JSON
// ============================================================================

/**
 * JSON.stringify replacer that sorts object keys alphabetically for deterministic output.
 *
 * @param {string} _key
 * @param {unknown} value
 * @returns {unknown}
 */
function sortedReplacer(_key, value) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    /** @type {{ [x: string]: unknown }} */
    const sorted = {};
    const obj = /** @type {{ [x: string]: unknown }} */ (value);
    for (const k of Object.keys(obj).sort()) {
      sorted[k] = obj[k];
    }
    return sorted;
  }
  return value;
}

/**
 * Produces a deterministic JSON string for a DeliveryObservation.
 *
 * @param {DeliveryObservation} observation
 * @returns {string}
 */
export function canonicalObservationJson(observation) {
  return JSON.stringify(observation, sortedReplacer);
}
