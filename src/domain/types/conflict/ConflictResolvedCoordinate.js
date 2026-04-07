/**
 * ConflictResolvedCoordinate — runtime-backed analysis coordinate metadata.
 *
 * @module domain/types/conflict/ConflictResolvedCoordinate
 */

import { requireNonEmptyString, requireEnum } from './validation.js';

const CTX = 'ConflictResolvedCoordinate';
const VALID_COORDINATE_KINDS = new Set(['frontier', 'strand']);

/**
 * Deep-freezes the frontier record.
 *
 * @param {Record<string, string>} frontier - Writer-to-SHA map.
 * @returns {Readonly<Record<string, string>>} Frozen frontier.
 */
function freezeFrontier(frontier) {
  if (frontier === null || frontier === undefined || typeof frontier !== 'object') {
    throw new TypeError(`${CTX}: frontier must be an object`);
  }
  return Object.freeze({ ...frontier });
}

/**
 * Deep-freezes the scan budget object.
 *
 * @param {{ maxPatches: number|null }} budget - The scan budget.
 * @returns {Readonly<{ maxPatches: number|null }>} Frozen budget.
 */
function freezeScanBudget(budget) {
  if (budget === null || budget === undefined || typeof budget !== 'object') {
    throw new TypeError(`${CTX}: scanBudgetApplied must be an object`);
  }
  return Object.freeze({ maxPatches: budget.maxPatches });
}

/**
 * Deep-freezes the optional strand metadata object, including nested braid.
 *
 * @param {unknown} strand - The strand metadata.
 * @returns {Record<string, unknown>|undefined} Frozen strand or undefined.
 */
function freezeStrand(strand) {
  if (strand === undefined || strand === null) {
    return undefined;
  }
  const raw = strand;
  const { braid, ...rest } = raw;
  const frozen = { ...rest };
  if (braid !== undefined && braid !== null) {
    frozen.braid = Object.freeze({
      readOverlayCount: braid.readOverlayCount,
      braidedStrandIds: Object.freeze(braid.braidedStrandIds.slice()),
    });
  }
  return Object.freeze(frozen);
}

/**
 * A runtime-backed description of the analysis coordinate scope.
 *
 * Instances are frozen on construction. All nested objects are deep-frozen.
 */
export default class ConflictResolvedCoordinate {
  /**
   * Creates a frozen ConflictResolvedCoordinate.
   *
   * @param {{
   *   analysisVersion: string,
   *   coordinateKind: 'frontier'|'strand',
   *   frontier: Record<string, string>,
   *   frontierDigest: string,
   *   lamportCeiling: number|null,
   *   scanBudgetApplied: { maxPatches: number|null },
   *   truncationPolicy: string,
   *   strand?: Record<string, unknown>
   * }} fields - Coordinate fields.
   */
  constructor({ analysisVersion, coordinateKind, frontier, frontierDigest, lamportCeiling, scanBudgetApplied, truncationPolicy, strand }) {
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
