/**
 * ConflictResolvedCoordinate — runtime-backed analysis coordinate metadata.
 *
 * @module domain/types/conflict/ConflictResolvedCoordinate
 */

import WarpError from '../../errors/WarpError.ts';
import StrandCoordinateMetadata from './StrandCoordinateMetadata.ts';
import { requireNonEmptyString, requireEnum } from './validation.ts';

const CTX = 'ConflictResolvedCoordinate';
const VALID_COORDINATE_KINDS = new Set(['frontier', 'strand']);

/**
 * Input shape for the strand field — either an existing
 * StrandCoordinateMetadata instance or a matching carrier bag the
 * constructor normalizes through the class.
 */
type StrandInput = StrandCoordinateMetadata | {
  strandId: string;
  baseLamportCeiling: number | null;
  overlayHeadPatchSha: string | null;
  overlayPatchCount: number;
  overlayWritable: boolean;
  braid?: { readOverlayCount: number; braidedStrandIds: readonly string[] };
};

/**
 * Deep-freezes the frontier record.
 */
function freezeFrontier(frontier: Record<string, string>): Readonly<Record<string, string>> {
  if (frontier === null || frontier === undefined || typeof frontier !== 'object') {
    throw new WarpError(`${CTX}: frontier must be an object`, 'E_VALIDATION');
  }
  return Object.freeze({ ...frontier });
}

/**
 * Deep-freezes the scan budget object.
 */
function freezeScanBudget(budget: { maxPatches: number | null }): Readonly<{ maxPatches: number | null }> {
  if (budget === null || budget === undefined || typeof budget !== 'object') {
    throw new WarpError(`${CTX}: scanBudgetApplied must be an object`, 'E_VALIDATION');
  }
  return Object.freeze({ maxPatches: budget.maxPatches });
}

/**
 * Normalizes the optional strand input into a
 * StrandCoordinateMetadata instance.
 */
function toStrandMetadata(strand: StrandInput | undefined | null): StrandCoordinateMetadata | undefined {
  if (strand === undefined || strand === null) {
    return undefined;
  }
  if (strand instanceof StrandCoordinateMetadata) {
    return strand;
  }
  return new StrandCoordinateMetadata(strand);
}

/**
 * A runtime-backed description of the analysis coordinate scope.
 *
 * Instances are frozen on construction. All nested objects are deep-frozen.
 */
export default class ConflictResolvedCoordinate {
  readonly analysisVersion: string;
  readonly coordinateKind: string;
  readonly frontier: Readonly<Record<string, string>>;
  readonly frontierDigest: string;
  readonly lamportCeiling: number | null;
  readonly scanBudgetApplied: Readonly<{ maxPatches: number | null }>;
  readonly truncationPolicy: string;
  readonly strand: StrandCoordinateMetadata | undefined;

  /**
   * Creates a frozen ConflictResolvedCoordinate.
   */
  constructor({ analysisVersion, coordinateKind, frontier, frontierDigest, lamportCeiling, scanBudgetApplied, truncationPolicy, strand }: {
    analysisVersion: string;
    coordinateKind: 'frontier' | 'strand';
    frontier: Record<string, string>;
    frontierDigest: string;
    lamportCeiling: number | null;
    scanBudgetApplied: { maxPatches: number | null };
    truncationPolicy: string;
    strand?: StrandInput;
  }) {
    this.analysisVersion = requireNonEmptyString(analysisVersion, 'analysisVersion', CTX);
    this.coordinateKind = requireEnum(coordinateKind, VALID_COORDINATE_KINDS, { name: 'coordinateKind', context: CTX });
    this.frontier = freezeFrontier(frontier);
    this.frontierDigest = requireNonEmptyString(frontierDigest, 'frontierDigest', CTX);
    this.lamportCeiling = lamportCeiling;
    this.scanBudgetApplied = freezeScanBudget(scanBudgetApplied);
    this.truncationPolicy = requireNonEmptyString(truncationPolicy, 'truncationPolicy', CTX);
    this.strand = toStrandMetadata(strand);
    Object.freeze(this);
  }
}
