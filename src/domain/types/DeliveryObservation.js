/**
 * DeliveryObservation — immutable substrate fact recording how a sink
 * handled an emitted effect under a given delivery lens.
 *
 * @module DeliveryObservation
 * @see docs/design/effect-emission-v1.md
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
 * @param {unknown} value
 * @returns {void}
 */
function validateTimestamp(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('timestamp must be a non-negative finite number');
  }
}

/**
 * @param {unknown} lens
 * @returns {void}
 */
function validateLens(lens) {
  if (lens === null || lens === undefined || typeof lens !== 'object') {
    throw new Error('lens must be an object');
  }
  const l = /** @type {Record<string, unknown>} */ (lens);
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
 * Creates an immutable DeliveryObservation.
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

  const frozenLens = Object.freeze({
    mode: /** @type {'live' | 'replay' | 'inspect'} */ (lens.mode),
    suppressExternal: lens.suppressExternal,
  });

  /** @type {{ emissionId: string, sinkId: string, outcome: 'delivered' | 'suppressed' | 'failed' | 'skipped', timestamp: number, lens: Readonly<ExternalizationPolicy>, reason?: string }} */
  const obs = {
    emissionId,
    sinkId,
    outcome: /** @type {'delivered' | 'suppressed' | 'failed' | 'skipped'} */ (outcome),
    timestamp,
    lens: frozenLens,
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
