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

import WarpError from '../errors/WarpError.ts';
import { DELIVERY_MODES, DELIVERY_OUTCOMES } from './ExternalizationPolicy.ts';

// Re-export constants for convenience (tests import from here too)
export { DELIVERY_MODES, DELIVERY_OUTCOMES };

// ============================================================================
// Types
// ============================================================================

/**
 * Causal coordinate at emission time.
 */
export class EffectCoordinate {
  /** Writer tip SHAs at emission time */
  readonly frontier: Readonly<Record<string, string>> | null;

  /** Lamport ceiling (if capped) */
  readonly ceiling: number | null;

  /**
   * Creates an immutable EffectCoordinate.
   */
  constructor({ frontier, ceiling }: { frontier: Record<string, string> | null; ceiling: number | null }) {
    this.frontier = frontier ? Object.freeze({ ...frontier }) : null;
    this.ceiling = ceiling ?? null;
    Object.freeze(this);
  }
}

/**
 * EffectEmission — host-domain trace object for an outbound effect candidate.
 */
export class EffectEmission {
  readonly id: string;
  readonly kind: string;
  readonly payload: unknown;
  readonly timestamp: number;
  readonly writer: string | null;
  readonly coordinate: Readonly<EffectCoordinate>;

  /**
   * Creates an immutable EffectEmission.
   */
  constructor({ id, kind, payload, timestamp, writer, coordinate }: {
    id: string;
    kind: string;
    payload: unknown;
    timestamp: number;
    writer: string | null;
    coordinate: { frontier: Record<string, string> | null; ceiling: number | null };
  }) {
    requireNonEmptyString(id, 'id');
    requireNonEmptyString(kind, 'kind');
    validateTimestamp(timestamp);
    validateCoordinate(coordinate);

    this.id = id;
    this.kind = kind;
    this.payload = payload;
    this.timestamp = timestamp;
    this.writer = writer ?? null;
    this.coordinate = new EffectCoordinate(coordinate);
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
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
}

/**
 * Asserts that a value is a non-negative finite number suitable for a wall-clock timestamp.
 */
function validateTimestamp(value: unknown): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new WarpError('timestamp must be a non-negative finite number', 'E_VALIDATION');
  }
}

/**
 * Asserts that a value is a non-null object suitable for use as an effect coordinate.
 */
function validateCoordinate(value: unknown): void {
  if (value === null || value === undefined || typeof value !== 'object') {
    throw new WarpError('coordinate must be an object', 'E_VALIDATION');
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Creates an immutable EffectEmission.
 */
export function createEffectEmission({ id, kind, payload, timestamp, writer, coordinate }: {
  id: string;
  kind: string;
  payload: unknown;
  timestamp: number;
  writer: string | null;
  coordinate: { frontier: Record<string, string> | null; ceiling: number | null };
}): Readonly<EffectEmission> {
  return new EffectEmission({ id, kind, payload, timestamp, writer, coordinate });
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
 * Produces a deterministic JSON string for an EffectEmission.
 */
export function canonicalEmissionJson(emission: EffectEmission): string {
  return JSON.stringify(emission, sortedReplacer);
}
