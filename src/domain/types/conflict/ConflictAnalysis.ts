/**
 * ConflictAnalysis — runtime-backed top-level result of conflict analysis.
 *
 * @module domain/types/conflict/ConflictAnalysis
 */

import { requireNonEmptyString } from './validation.ts';
import type ConflictResolvedCoordinate from './ConflictResolvedCoordinate.ts';
import type ConflictDiagnostic from './ConflictDiagnostic.ts';
import type ConflictTrace from './ConflictTrace.ts';

const CTX = 'ConflictAnalysis';

/**
 * The top-level result of a conflict analysis run.
 *
 * Instances are frozen on construction. Diagnostics and conflicts arrays are frozen.
 */
export default class ConflictAnalysis {
  readonly analysisVersion: string;
  readonly resolvedCoordinate: ConflictResolvedCoordinate;
  readonly analysisSnapshotHash: string;
  readonly diagnostics: readonly ConflictDiagnostic[] | undefined;
  readonly conflicts: readonly ConflictTrace[];

  /**
   * Creates a frozen ConflictAnalysis result.
   */
  constructor({ analysisVersion, resolvedCoordinate, analysisSnapshotHash, diagnostics, conflicts }: {
    analysisVersion: string;
    resolvedCoordinate: ConflictResolvedCoordinate;
    analysisSnapshotHash: string;
    diagnostics?: ConflictDiagnostic[];
    conflicts: ConflictTrace[];
  }) {
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
