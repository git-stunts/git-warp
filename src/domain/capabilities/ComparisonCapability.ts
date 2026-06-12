/**
 * Coordinate and strand comparison, transfer planning.
 *
 * 5 methods for visible-state diffing and transfer plan generation.
 */

import type Patch from '../types/Patch.ts';
import type {
  CoordinateComparisonSelectorInput,
  CoordinateComparison,
  CoordinateTransferPlanSelectorInput,
  CoordinateTransferPlan,
  VisibleStateScope,
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
  scope?: VisibleStateScope | null;
};

/** Options for planStrandTransfer(). */
export type PlanStrandTransferOptions = {
  into?: 'base' | 'live' | { kind: 'strand'; strandId: string };
  ceiling?: number | null;
  intoCeiling?: number | null;
  scope?: VisibleStateScope | null;
};

/** Options for compareCoordinates(). */
export type CompareCoordinatesOptions = {
  left: CoordinateComparisonSelectorInput;
  right: CoordinateComparisonSelectorInput;
  targetId?: string | null;
  scope?: VisibleStateScope | null;
};

/** Options for planCoordinateTransfer(). */
export type PlanCoordinateTransferOptions = {
  source: CoordinateTransferPlanSelectorInput;
  target: CoordinateTransferPlanSelectorInput;
  scope?: VisibleStateScope | null;
};

export default abstract class ComparisonCapability {
  abstract buildPatchDivergence(
    _leftEntries: ComparisonPatchEntry[],
    _rightEntries: ComparisonPatchEntry[],
    _targetId?: string | null,
  ): Record<string, unknown>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  abstract compareStrand(
    _strandId: string,
    _options?: CompareStrandOptions,
  ): Promise<CoordinateComparison>;
  abstract planStrandTransfer(
    _strandId: string,
    _options?: PlanStrandTransferOptions,
  ): Promise<CoordinateTransferPlan>;
  abstract compareCoordinates(
    _options: CompareCoordinatesOptions,
  ): Promise<CoordinateComparison>;
  abstract planCoordinateTransfer(
    _options: PlanCoordinateTransferOptions,
  ): Promise<CoordinateTransferPlan>;
}
