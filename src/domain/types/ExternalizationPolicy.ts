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

import WarpError from '../errors/WarpError.ts';

// ============================================================================
// Constants
// ============================================================================

export type DeliveryMode = 'live' | 'replay' | 'inspect';
export type DeliveryOutcome = 'delivered' | 'suppressed' | 'failed' | 'skipped';

export type ExternalizationPolicy = {
  mode: DeliveryMode;
  suppressExternal: boolean;
};

/**
 * Valid delivery modes.
 */
export const DELIVERY_MODES: readonly string[] = Object.freeze(['live', 'replay', 'inspect']);

/**
 * Valid delivery outcomes.
 */
export const DELIVERY_OUTCOMES: readonly string[] = Object.freeze([
  'delivered',
  'suppressed',
  'failed',
  'skipped',
]);

export const OUTCOME_DELIVERED: 'delivered' = 'delivered';
export const OUTCOME_SUPPRESSED: 'suppressed' = 'suppressed';
export const OUTCOME_FAILED: 'failed' = 'failed';
const MODE_LIVE: 'live' = 'live';
const MODE_REPLAY: 'replay' = 'replay';
const MODE_INSPECT: 'inspect' = 'inspect';

const modeSet = new Set(DELIVERY_MODES);
const outcomeSet = new Set(DELIVERY_OUTCOMES);

// ============================================================================
// Validation
// ============================================================================

/**
 * Asserts that a mode value is one of the recognized delivery modes (live, replay, inspect).
 */
function validateMode(mode: unknown): void {
  if (typeof mode !== 'string' || !modeSet.has(mode)) {
    throw new WarpError(
      `mode must be one of: ${DELIVERY_MODES.join(', ')}`,
      'E_VALIDATION',
    );
  }
}

/**
 * Asserts that suppressExternal is a boolean value.
 */
function validateSuppressExternal(value: unknown): void {
  if (typeof value !== 'boolean') {
    throw new WarpError('suppressExternal must be a boolean', 'E_VALIDATION');
  }
}

/**
 * Validates and narrows a delivery outcome value.
 */
export function validateOutcome(value: string): DeliveryOutcome {
  if (!outcomeSet.has(value)) {
    throw new WarpError(
      `outcome must be one of: ${DELIVERY_OUTCOMES.join(', ')}`,
      'E_VALIDATION',
    );
  }
  // Runtime-proven: outcomeSet.has(value) guarantees value is a DeliveryOutcome.
  // TypeScript's Set.has() doesn't narrow, so we cast after the guard.
  return value as DeliveryOutcome;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Creates an immutable ExternalizationPolicy.
 */
export function createExternalizationPolicy(params: { mode: string; suppressExternal: boolean }): Readonly<ExternalizationPolicy> {
  if (params === null || params === undefined || typeof params !== 'object') {
    throw new WarpError('ExternalizationPolicy params must be an object', 'E_VALIDATION');
  }
  validateMode(params.mode);
  validateSuppressExternal(params.suppressExternal);

  return Object.freeze({
    mode: params.mode as DeliveryMode,
    suppressExternal: params.suppressExternal,
  });
}

// ============================================================================
// Preset Lenses
// ============================================================================

/** Live execution — effects are delivered normally. */
export const LIVE_LENS: Readonly<ExternalizationPolicy> = createExternalizationPolicy({
  mode: MODE_LIVE,
  suppressExternal: false,
});

/** Replay execution — external delivery is suppressed. */
export const REPLAY_LENS: Readonly<ExternalizationPolicy> = createExternalizationPolicy({
  mode: MODE_REPLAY,
  suppressExternal: true,
});

/** Inspect execution — dry-run, external delivery is suppressed. */
export const INSPECT_LENS: Readonly<ExternalizationPolicy> = createExternalizationPolicy({
  mode: MODE_INSPECT,
  suppressExternal: true,
});
