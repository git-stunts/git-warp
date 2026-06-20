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
import { sortedReplacer } from '../utils/canonicalStringify.ts';
import { requireNonEmptyString, validateTimestamp } from '../utils/scalarValidation.ts';
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
  readonly payload: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  readonly timestamp: number;
  readonly writer: string | null;
  readonly coordinate: Readonly<EffectCoordinate>;

  /**
   * Creates an immutable EffectEmission.
   */
  constructor({ id, kind, payload, timestamp, writer, coordinate }: {
    id: string;
    kind: string;
    payload: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
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
 * Asserts that a value is a non-null object suitable for use as an effect coordinate.
 */
function validateCoordinate(value: unknown): void { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
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
  payload: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
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
 * Produces a deterministic JSON string for an EffectEmission.
 */
export function canonicalEmissionJson(emission: EffectEmission): string {
  return JSON.stringify(emission, sortedReplacer); // nosemgrep: ts-no-json-stringify-in-core -- 0025B
}
