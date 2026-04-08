/**
 * ConflictResolvedCoordinate — runtime-backed analysis coordinate metadata.
 *
 * @module domain/types/conflict/ConflictResolvedCoordinate
 */

import { requireNonEmptyString, requireEnum } from './validation.ts';

const CTX = 'ConflictResolvedCoordinate';
const VALID_COORDINATE_KINDS = new Set(['frontier', 'strand']);

type BraidData = {
  readOverlayCount: number;
  braidedStrandIds: readonly string[];
};

type StrandData = Record<string, unknown> & {
  braid?: BraidData;
};

/**
 * Deep-freezes the frontier record.
 */
function freezeFrontier(frontier: Record<string, string>): Readonly<Record<string, string>> {
  if (frontier === null || frontier === undefined || typeof frontier !== 'object') {
    throw new TypeError(`${CTX}: frontier must be an object`);
  }
  return Object.freeze({ ...frontier });
}

/**
 * Deep-freezes the scan budget object.
 */
function freezeScanBudget(budget: { maxPatches: number | null }): Readonly<{ maxPatches: number | null }> {
  if (budget === null || budget === undefined || typeof budget !== 'object') {
    throw new TypeError(`${CTX}: scanBudgetApplied must be an object`);
  }
  return Object.freeze({ maxPatches: budget.maxPatches });
}

/**
 * Deep-freezes the optional strand metadata object, including nested braid.
 */
function freezeStrand(strand: StrandData | undefined | null): StrandData | undefined {
  if (strand === undefined || strand === null) {
    return undefined;
  }
  const raw = strand;
  const { braid, ...rest } = raw;
  const frozen: Record<string, unknown> = { ...rest };
  if (braid !== undefined && braid !== null) {
    frozen['braid'] = Object.freeze({
      readOverlayCount: braid.readOverlayCount,
      braidedStrandIds: Object.freeze(braid.braidedStrandIds.slice()),
    });
  }
  return Object.freeze(frozen) as StrandData;
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
  readonly strand: StrandData | undefined;

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
    strand?: StrandData;
  }) {
    this.analysisVersion = requireNonEmptyString(analysisVersion, 'analysisVersion', CTX);
    this.coordinateKind = requireEnum(coordinateKind, VALID_COORDINATE_KINDS, { name: 'coordinateKind', context: CTX });
    this.frontier = freezeFrontier(frontier);
    this.frontierDigest = requireNonEmptyString(frontierDigest, 'frontierDigest', CTX);
    this.lamportCeiling = lamportCeiling;
    this.scanBudgetApplied = freezeScanBudget(scanBudgetApplied);
    this.truncationPolicy = requireNonEmptyString(truncationPolicy, 'truncationPolicy', CTX);
    this.strand = freezeStrand(strand);
    Object.freeze(this);
  }
}
