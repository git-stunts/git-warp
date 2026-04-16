/**
 * ComparisonController — substrate-visible coordinate and strand comparison.
 *
 * Thin facade that delegates to ComparisonEngine functions.
 * The controller is bound to a WarpRuntime host instance.
 *
 * @module domain/services/controllers/ComparisonController
 */

import type {
  CoordinateComparisonV1,
  CoordinateTransferPlanV1,
} from '../../types/CoordinateComparison.ts';
import type {
  CompareStrandOptions,
  PlanStrandTransferOptions,
  CompareCoordinatesOptions,
  PlanCoordinateTransferOptions,
} from '../../capabilities/ComparisonCapability.ts';
import type { ComparisonHost, PatchEntry } from './ComparisonSelector.ts';
import {
  buildPatchDivergenceImpl,
  compareStrandImpl,
  planStrandTransferImpl,
  planCoordinateTransferImpl,
  compareCoordinatesImpl,
  type VisiblePatchDivergenceV1,
} from './ComparisonEngine.ts';

export default class ComparisonController {
  _host: ComparisonHost;

  constructor(host: ComparisonHost) {
    this._host = host;
  }

  buildPatchDivergence(
    leftEntries: PatchEntry[],
    rightEntries: PatchEntry[],
    targetId?: string | null,
  ): VisiblePatchDivergenceV1 {
    return buildPatchDivergenceImpl(leftEntries, rightEntries, targetId ?? null);
  }

  async compareStrand(
    strandId: string,
    options: CompareStrandOptions = {},
  ): Promise<CoordinateComparisonV1> {
    return await compareStrandImpl(this._host, strandId, options);
  }

  async planStrandTransfer(
    strandId: string,
    options: PlanStrandTransferOptions = {},
  ): Promise<CoordinateTransferPlanV1> {
    return await planStrandTransferImpl(this._host, strandId, options);
  }

  async planCoordinateTransfer(
    options: PlanCoordinateTransferOptions,
  ): Promise<CoordinateTransferPlanV1> {
    return await planCoordinateTransferImpl(this._host, options);
  }

  async compareCoordinates(
    options: CompareCoordinatesOptions,
  ): Promise<CoordinateComparisonV1> {
    return await compareCoordinatesImpl(this._host, options);
  }
}
