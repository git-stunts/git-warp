/**
 * ConflictAnalysis — runtime-backed top-level result of conflict analysis.
 *
 * @module domain/types/conflict/ConflictAnalysis
 */

import { requireNonEmptyString } from './validation.js';

const CTX = 'ConflictAnalysis';

/**
 * The top-level result of a conflict analysis run.
 *
 * Instances are frozen on construction. Diagnostics and conflicts arrays are frozen.
 */
export default class ConflictAnalysis {
  /**
   * Creates a frozen ConflictAnalysis result.
   *
   * @param {{
   *   analysisVersion: string,
   *   resolvedCoordinate: import('./ConflictResolvedCoordinate.js').default,
   *   analysisSnapshotHash: string,
   *   diagnostics?: Array<import('./ConflictDiagnostic.js').default>,
   *   conflicts: Array<import('./ConflictTrace.js').default>
   * }} fields - Analysis result fields.
   */
  constructor({ analysisVersion, resolvedCoordinate, analysisSnapshotHash, diagnostics, conflicts }) {
    this.analysisVersion = requireNonEmptyString(analysisVersion, 'analysisVersion', CTX);
    this.resolvedCoordinate = resolvedCoordinate;
    this.analysisSnapshotHash = requireNonEmptyString(analysisSnapshotHash, 'analysisSnapshotHash', CTX);
    this.diagnostics = diagnostics !== undefined && diagnostics !== null && diagnostics.length > 0
      ? Object.freeze([...diagnostics])
      : undefined;
    this.conflicts = Object.freeze([...conflicts]);
    Object.freeze(this);
  }
}
