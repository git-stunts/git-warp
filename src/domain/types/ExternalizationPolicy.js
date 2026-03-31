/**
 * ExternalizationPolicy — execution/delivery context that shapes how effects
 * may or may not be externalized.
 *
 * Not the same as an Observer lens (which shapes what you can *see*).
 * An externalization policy shapes what the system is *allowed to do* with
 * outbound effects.
 *
 * @module ExternalizationPolicy
 * @see docs/design/effect-emission-v1.md
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Valid delivery modes.
 * @type {ReadonlyArray<string>}
 */
export const DELIVERY_MODES = Object.freeze(['live', 'replay', 'inspect']);

/**
 * Valid delivery outcomes.
 * @type {ReadonlyArray<string>}
 */
export const DELIVERY_OUTCOMES = Object.freeze([
  'delivered',
  'suppressed',
  'failed',
  'skipped',
]);

const modeSet = new Set(DELIVERY_MODES);
const outcomeSet = new Set(DELIVERY_OUTCOMES);

// ============================================================================
// Validation
// ============================================================================

/**
 * @param {unknown} mode
 * @returns {void}
 */
function validateMode(mode) {
  if (typeof mode !== 'string' || !modeSet.has(mode)) {
    throw new Error(
      `mode must be one of: ${DELIVERY_MODES.join(', ')}`,
    );
  }
}

/**
 * @param {unknown} value
 * @returns {void}
 */
function validateSuppressExternal(value) {
  if (typeof value !== 'boolean') {
    throw new Error('suppressExternal must be a boolean');
  }
}

/**
 * Validates a delivery outcome value.
 *
 * @param {unknown} value
 * @returns {void}
 */
export function validateOutcome(value) {
  if (typeof value !== 'string' || !outcomeSet.has(value)) {
    throw new Error(
      `outcome must be one of: ${DELIVERY_OUTCOMES.join(', ')}`,
    );
  }
}

// ============================================================================
// Types
// ============================================================================

/**
 * @typedef {Object} ExternalizationPolicy
 * @property {'live' | 'replay' | 'inspect'} mode - Execution mode
 * @property {boolean} suppressExternal - Whether external delivery is blocked
 */

// ============================================================================
// Factory
// ============================================================================

/**
 * Creates an immutable ExternalizationPolicy.
 *
 * @param {{ mode: string, suppressExternal: boolean }} params
 * @returns {Readonly<ExternalizationPolicy>}
 */
export function createExternalizationPolicy(params) {
  if (params === null || params === undefined || typeof params !== 'object') {
    throw new Error('ExternalizationPolicy params must be an object');
  }
  validateMode(params.mode);
  validateSuppressExternal(params.suppressExternal);

  return Object.freeze({
    mode: /** @type {'live' | 'replay' | 'inspect'} */ (params.mode),
    suppressExternal: params.suppressExternal,
  });
}

// ============================================================================
// Preset Lenses
// ============================================================================

/** Live execution — effects are delivered normally. */
export const LIVE_LENS = createExternalizationPolicy({
  mode: 'live',
  suppressExternal: false,
});

/** Replay execution — external delivery is suppressed. */
export const REPLAY_LENS = createExternalizationPolicy({
  mode: 'replay',
  suppressExternal: true,
});

/** Inspect execution — dry-run, external delivery is suppressed. */
export const INSPECT_LENS = createExternalizationPolicy({
  mode: 'inspect',
  suppressExternal: true,
});
