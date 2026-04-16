/**
 * StrandCoordinateMetadata — runtime-backed strand-specific metadata
 * attached to a ConflictResolvedCoordinate.
 *
 * Carries the strand identity, its base observation Lamport ceiling,
 * overlay coordinates, and braid summary for analysis results that
 * resolved through a strand coordinate rather than the frontier.
 *
 * Instances are frozen on construction. All invariants are validated
 * eagerly. The nested `braid` block is deep-frozen.
 *
 * @module domain/types/conflict/StrandCoordinateMetadata
 */

import WarpError from '../../errors/WarpError.ts';
import { compareStrings, requireBoolean, requireNonEmptyString, requireNonNegativeInt } from './validation.ts';

const CTX = 'StrandCoordinateMetadata';

type BraidSummary = {
  readonly readOverlayCount: number;
  readonly braidedStrandIds: readonly string[];
};

type StrandCoordinateMetadataFields = {
  strandId: string;
  baseLamportCeiling: number | null;
  overlayHeadPatchSha: string | null;
  overlayPatchCount: number;
  overlayWritable: boolean;
  braid?: {
    readOverlayCount: number;
    braidedStrandIds: readonly string[];
  };
};

/**
 * Validates that a value is either a non-negative integer or null.
 */
function requireOptionalNonNegativeInt(value: number | null, name: string): number | null {
  if (value === null) {
    return null;
  }
  return requireNonNegativeInt(value, name, CTX);
}

/**
 * Validates that a value is either a non-empty string or null.
 */
function requireNullableString(value: string | null, name: string): string | null {
  if (value === null) {
    return null;
  }
  return requireNonEmptyString(value, name, CTX);
}

type BraidInput = NonNullable<StrandCoordinateMetadataFields['braid']>;

/**
 * Validates the optional braid sub-object and deep-freezes it when
 * provided. Returns undefined when absent.
 */
function freezeBraid(braid: BraidInput | undefined): BraidSummary | undefined {
  if (braid === undefined) {
    return undefined;
  }
  if (braid === null || typeof braid !== 'object') {
    throw new WarpError(`${CTX}: braid must be an object when provided`, 'E_VALIDATION');
  }
  requireNonNegativeInt(braid.readOverlayCount, 'braid.readOverlayCount', CTX);
  if (!Array.isArray(braid.braidedStrandIds)) {
    throw new WarpError(`${CTX}: braid.braidedStrandIds must be an array`, 'E_VALIDATION');
  }
  const ids: readonly string[] = braid.braidedStrandIds;
  return Object.freeze({
    readOverlayCount: braid.readOverlayCount,
    braidedStrandIds: Object.freeze(ids.slice().sort(compareStrings)),
  });
}

/**
 * A runtime-backed summary of a strand coordinate, attached to a
 * ConflictResolvedCoordinate when the analysis ran against a strand
 * instead of the frontier.
 */
export default class StrandCoordinateMetadata {
  readonly strandId: string;
  readonly baseLamportCeiling: number | null;
  readonly overlayHeadPatchSha: string | null;
  readonly overlayPatchCount: number;
  readonly overlayWritable: boolean;
  readonly braid: BraidSummary | undefined;

  /**
   * Creates a frozen StrandCoordinateMetadata with validated fields.
   */
  constructor({ strandId, baseLamportCeiling, overlayHeadPatchSha, overlayPatchCount, overlayWritable, braid }: StrandCoordinateMetadataFields) {
    this.strandId = requireNonEmptyString(strandId, 'strandId', CTX);
    this.baseLamportCeiling = requireOptionalNonNegativeInt(baseLamportCeiling, 'baseLamportCeiling');
    this.overlayHeadPatchSha = requireNullableString(overlayHeadPatchSha, 'overlayHeadPatchSha');
    this.overlayPatchCount = requireNonNegativeInt(overlayPatchCount, 'overlayPatchCount', CTX);
    this.overlayWritable = requireBoolean(overlayWritable, 'overlayWritable', CTX);
    this.braid = freezeBraid(braid);
    Object.freeze(this);
  }
}
