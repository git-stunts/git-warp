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
    validateOutcome(outcome);
    validateTimestamp(timestamp);
    validateLens(lens);

    this.emissionId = emissionId;
    this.sinkId = sinkId;
    this.outcome = outcome as DeliveryOutcome;
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
 * Asserts that a value is a non-empty string, throwing if it is not.
 */
function requireNonEmptyString(value: unknown, name: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

/**
 * Asserts that a value is a non-negative finite number suitable for a wall-clock timestamp.
 */
function validateTimestamp(value: unknown): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('timestamp must be a non-negative finite number');
  }
}

/**
 * Asserts that a lens is a valid ExternalizationPolicy shape with a recognized mode and boolean suppressExternal.
 */
function validateLens(lens: unknown): void {
  if (lens === null || lens === undefined || typeof lens !== 'object') {
    throw new Error('lens must be an object');
  }
  const l = lens as Record<string, unknown>;
  validateLensFields(l);
}

/**
 * Validates the individual fields of a lens object after the object guard has passed.
 */
function validateLensFields(l: Record<string, unknown>): void {
  const modeKey = 'mode';
  const suppressKey = 'suppressExternal';
  if (typeof l[modeKey] !== 'string' || !modeSet.has(l[modeKey])) {
    throw new Error(
      `lens.mode must be one of: ${DELIVERY_MODES.join(', ')}`,
    );
  }
  if (typeof l[suppressKey] !== 'boolean') {
    throw new Error('lens.suppressExternal must be a boolean');
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

// ============================================================================
// Canonical JSON
// ============================================================================

/**
 * JSON.stringify replacer that sorts object keys alphabetically for deterministic output.
 */
function sortedReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const sorted: { [x: string]: unknown } = {};
    const obj = value as { [x: string]: unknown };
    for (const k of Object.keys(obj).sort()) {
      sorted[k] = obj[k];
    }
    return sorted;
  }
  return value;
}

/**
 * Produces a deterministic JSON string for a DeliveryObservation.
 */
export function canonicalObservationJson(observation: DeliveryObservation): string {
  return JSON.stringify(observation, sortedReplacer);
}
