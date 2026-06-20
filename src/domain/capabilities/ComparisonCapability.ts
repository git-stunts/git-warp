/**
 * Coordinate and strand comparison, transfer planning.
 *
 * 5 methods for visible-state diffing and transfer plan generation.
 */

import type Patch from '../types/Patch.ts';
import type GraphDiff from '../services/comparison/GraphDiff.ts';
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

/** Options for graph diff over the live coordinate at two Lamport ceilings. */
export type GraphDiffOptions = {
  from: number;
  to: number;
  targetId?: string | null;
  scope?: VisibleStateScope | null;
};

export default abstract class ComparisonCapability {
  /** Build a patch-divergence summary from two ordered patch streams. */
  abstract buildPatchDivergence(
    _leftEntries: ComparisonPatchEntry[],
    _rightEntries: ComparisonPatchEntry[],
    _targetId?: string | null,
  ): Record<string, unknown>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B

  /** Compare a strand against its base, live graph, or another strand. */
  abstract compareStrand(
    _strandId: string,
    _options?: CompareStrandOptions,
  ): Promise<CoordinateComparison>;

  /** Plan how to transfer visible strand state into another coordinate. */
  abstract planStrandTransfer(
    _strandId: string,
    _options?: PlanStrandTransferOptions,
  ): Promise<CoordinateTransferPlan>;

  /** Compare two explicit coordinate selectors. */
  abstract compareCoordinates(
    _options: CompareCoordinatesOptions,
  ): Promise<CoordinateComparison>;

  /** Return a first-class graph delta between two live Lamport ceilings. */
  abstract diff(
    _options: GraphDiffOptions,
  ): Promise<GraphDiff>;

  /** Plan transfer from one explicit coordinate selector into another. */
  abstract planCoordinateTransfer(
    _options: PlanCoordinateTransferOptions,
  ): Promise<CoordinateTransferPlan>;
}
