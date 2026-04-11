/**
 * Coordinate and strand comparison, transfer planning.
 *
 * 5 methods for visible-state diffing and transfer plan generation.
 */

import type Patch from '../types/Patch.ts';
import type {
  CoordinateComparisonSelectorV1,
  CoordinateComparisonV1,
  CoordinateTransferPlanSelectorV1,
  CoordinateTransferPlanV1,
  VisibleStateScopeV1,
} from '../types/CoordinateComparison.ts';

/** Patch with its content-addressable SHA. */
export type ComparisonPatchEntry = {
  patch: Patch;
  sha: string;
};

/** Options for compareStrand(). */
export type CompareStrandOptions = {
  against?: 'base' | 'live' | { kind: 'strand'; strandId: string };
  ceiling?: number | null;
  againstCeiling?: number | null;
  targetId?: string | null;
  scope?: VisibleStateScopeV1 | null;
};

/** Options for planStrandTransfer(). */
export type PlanStrandTransferOptions = {
  into?: 'base' | 'live' | { kind: 'strand'; strandId: string };
  ceiling?: number | null;
  intoCeiling?: number | null;
  scope?: VisibleStateScopeV1 | null;
};

/** Options for compareCoordinates(). */
export type CompareCoordinatesOptions = {
  left: CoordinateComparisonSelectorV1;
  right: CoordinateComparisonSelectorV1;
  targetId?: string | null;
  scope?: VisibleStateScopeV1 | null;
};

/** Options for planCoordinateTransfer(). */
export type PlanCoordinateTransferOptions = {
  source: CoordinateTransferPlanSelectorV1;
  target: CoordinateTransferPlanSelectorV1;
  scope?: VisibleStateScopeV1 | null;
};

export default abstract class ComparisonCapability {
  abstract buildPatchDivergence(
    _leftEntries: ComparisonPatchEntry[],
    _rightEntries: ComparisonPatchEntry[],
    _targetId?: string | null,
  ): Record<string, unknown>;
  abstract compareStrand(
    _strandId: string,
    _options?: CompareStrandOptions,
  ): Promise<CoordinateComparisonV1>;
  abstract planStrandTransfer(
    _strandId: string,
    _options?: PlanStrandTransferOptions,
  ): Promise<CoordinateTransferPlanV1>;
  abstract compareCoordinates(
    _options: CompareCoordinatesOptions,
  ): Promise<CoordinateComparisonV1>;
  abstract planCoordinateTransfer(
    _options: PlanCoordinateTransferOptions,
  ): Promise<CoordinateTransferPlanV1>;
}
