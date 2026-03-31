/**
 * EffectEmission — host-domain read model / event shape for an
 * outbound effect candidate.
 *
 * This is a host-side trace object, NOT causal substrate truth.
 * The source of truth for effects is `effect:*` graph entities
 * written by participants. This type mirrors that graph-level
 * entity schema for use in the host-domain effect pipeline.
 *
 * @module EffectEmission
 * @see docs/design/effect-entity-convention.md
 * @see docs/design/layer-boundary.md
 */

import { DELIVERY_MODES, DELIVERY_OUTCOMES } from './ExternalizationPolicy.js';

// Re-export constants for convenience (tests import from here too)
export { DELIVERY_MODES, DELIVERY_OUTCOMES };

// ============================================================================
// Types
// ============================================================================

/**
 * @typedef {Object} EffectCoordinate
 * @property {Record<string, string> | null} frontier - Writer tip SHAs at emission time
 * @property {number | null} ceiling - Lamport ceiling (if capped)
 */

/**
 * @typedef {Object} EffectEmission
 * @property {string} id - Unique emission ID
 * @property {string} kind - Effect kind (generic string, app chooses meaning)
 * @property {unknown} payload - Opaque effect payload
 * @property {number} timestamp - Wall-clock milliseconds
 * @property {string | null} writer - Writer ID (null if not writer-scoped)
 * @property {Readonly<EffectCoordinate>} coordinate - Causal position
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
 * Asserts that a value is a non-null object suitable for use as an effect coordinate.
 *
 * @param {unknown} value
 * @returns {void}
 */
function validateCoordinate(value) {
  if (value === null || value === undefined || typeof value !== 'object') {
    throw new Error('coordinate must be an object');
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Creates an immutable EffectEmission.
 *
 * @param {{
 *   id: string,
 *   kind: string,
 *   payload: unknown,
 *   timestamp: number,
 *   writer: string | null,
 *   coordinate: { frontier: Record<string, string> | null, ceiling: number | null }
 * }} params
 * @returns {Readonly<EffectEmission>}
 */
export function createEffectEmission({ id, kind, payload, timestamp, writer, coordinate }) {
  requireNonEmptyString(id, 'id');
  requireNonEmptyString(kind, 'kind');
  validateTimestamp(timestamp);
  validateCoordinate(coordinate);

  const frozenCoordinate = Object.freeze({
    frontier: coordinate.frontier
      ? Object.freeze({ ...coordinate.frontier })
      : null,
    ceiling: coordinate.ceiling ?? null,
  });

  return Object.freeze({
    id,
    kind,
    payload,
    timestamp,
    writer: writer ?? null,
    coordinate: frozenCoordinate,
  });
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
 * Produces a deterministic JSON string for an EffectEmission.
 *
 * @param {EffectEmission} emission
 * @returns {string}
 */
export function canonicalEmissionJson(emission) {
  return JSON.stringify(emission, sortedReplacer);
}
