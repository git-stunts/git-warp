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

/** @type {'delivered'} */
export const OUTCOME_DELIVERED = 'delivered';
/** @type {'suppressed'} */
export const OUTCOME_SUPPRESSED = 'suppressed';
/** @type {'failed'} */
export const OUTCOME_FAILED = 'failed';
/** @type {'skipped'} */
export const OUTCOME_SKIPPED = 'skipped';

/** @type {'live'} */
export const MODE_LIVE = 'live';
/** @type {'replay'} */
export const MODE_REPLAY = 'replay';
/** @type {'inspect'} */
export const MODE_INSPECT = 'inspect';

const modeSet = new Set(DELIVERY_MODES);
const outcomeSet = new Set(DELIVERY_OUTCOMES);

// ============================================================================
// Validation
// ============================================================================

/**
 * Asserts that a mode value is one of the recognized delivery modes (live, replay, inspect).
 *
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
 * Asserts that suppressExternal is a boolean value.
 *
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
  mode: MODE_LIVE,
  suppressExternal: false,
});

/** Replay execution — external delivery is suppressed. */
export const REPLAY_LENS = createExternalizationPolicy({
  mode: MODE_REPLAY,
  suppressExternal: true,
});

/** Inspect execution — dry-run, external delivery is suppressed. */
export const INSPECT_LENS = createExternalizationPolicy({
  mode: MODE_INSPECT,
  suppressExternal: true,
});
