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

import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString, validateTimestamp } from '../utils/scalarValidation.ts';
import { validateOutcome, DELIVERY_MODES, type ExternalizationPolicy, type DeliveryOutcome } from './ExternalizationPolicy.ts';

const modeSet = new Set(DELIVERY_MODES);

// ============================================================================
// Types
// ============================================================================

/**
 * DeliveryObservation — trace record of how a sink handled an emitted effect.
 */
export class DeliveryObservation {
  /** Links to the EffectEmission */
  readonly emissionId: string;

  /** Which sink/adapter handled it */
  readonly sinkId: string;

  readonly outcome: DeliveryOutcome;

  /** Why (e.g., "replay mode"). Omitted (not null) when absent. */
  readonly reason: string | undefined;

  /** Wall-clock milliseconds */
  readonly timestamp: number;

  /** Execution context at delivery time */
  readonly lens: Readonly<ExternalizationPolicy>;

  /**
   * Creates an immutable DeliveryObservation.
   */
  constructor({ emissionId, sinkId, outcome, reason, timestamp, lens }: {
    emissionId: string;
    sinkId: string;
    outcome: string;
    reason?: string;
    timestamp: number;
    lens: { mode: string; suppressExternal: boolean };
  }) {
    requireNonEmptyString(emissionId, 'emissionId');
    requireNonEmptyString(sinkId, 'sinkId');
    const validatedOutcome = validateOutcome(outcome);
    validateTimestamp(timestamp);
    validateLens(lens);

    this.emissionId = emissionId;
    this.sinkId = sinkId;
    this.outcome = validatedOutcome;
    this.timestamp = timestamp;
    this.lens = freezeLens(lens);
    if (reason !== undefined) {
      this.reason = reason;
    }
    Object.freeze(this);
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Asserts that a lens is a non-null object.
 */
function requireLensObject(lens: { mode: string; suppressExternal: boolean }): void {
  if (lens === null || lens === undefined || typeof lens !== 'object') {
    throw new WarpError('lens must be an object', 'E_VALIDATION');
  }
}

/**
 * Validates a lens has a recognized mode and boolean suppressExternal.
 */
function validateLens(lens: { mode: string; suppressExternal: boolean }): void {
  requireLensObject(lens);
  if (!modeSet.has(lens.mode)) {
    throw new WarpError(
      `lens.mode must be one of: ${DELIVERY_MODES.join(', ')}`,
      'E_VALIDATION',
    );
  }
  if (typeof lens.suppressExternal !== 'boolean') {
    throw new WarpError('lens.suppressExternal must be a boolean', 'E_VALIDATION');
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Freezes a lens into an immutable ExternalizationPolicy snapshot.
 */
function freezeLens(lens: { mode: string; suppressExternal: boolean }): Readonly<ExternalizationPolicy> {
  return Object.freeze({
    mode: lens.mode as ExternalizationPolicy['mode'],
    suppressExternal: lens.suppressExternal,
  });
}

/**
 * Creates an immutable DeliveryObservation from validated parameters.
 */
export function createDeliveryObservation({ emissionId, sinkId, outcome, reason, timestamp, lens }: {
  emissionId: string;
  sinkId: string;
  outcome: string;
  reason?: string;
  timestamp: number;
  lens: { mode: string; suppressExternal: boolean };
}): Readonly<DeliveryObservation> {
  return new DeliveryObservation({
    emissionId, sinkId, outcome, timestamp, lens,
    ...(reason !== undefined ? { reason } : {}),
  });
}
