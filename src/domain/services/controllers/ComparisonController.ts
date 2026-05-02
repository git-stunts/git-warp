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
import type {
  ComparisonHost,
  ComparisonSelectorContext,
  PatchEntry,
} from './ComparisonSelector.ts';
import {
  buildPatchDivergenceImpl,
  compareStrandImpl,
  planStrandTransferImpl,
  planCoordinateTransferImpl,
  compareCoordinatesImpl,
  type VisiblePatchDivergenceV1,
} from './ComparisonEngine.ts';

export type ComparisonControllerDeps = {
  readonly host: ComparisonHost;
  readonly selectorContext: ComparisonSelectorContext;
};

export default class ComparisonController {
  private readonly _host: ComparisonHost;
  private readonly _selectorContext: ComparisonSelectorContext;

  constructor(deps: ComparisonControllerDeps) {
    this._host = deps.host;
    this._selectorContext = deps.selectorContext;
    Object.freeze(this);
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
    return await compareStrandImpl(this._host, this._selectorContext, strandId, options);
  }

  async planStrandTransfer(
    strandId: string,
    options: PlanStrandTransferOptions = {},
  ): Promise<CoordinateTransferPlanV1> {
    return await planStrandTransferImpl(this._host, this._selectorContext, strandId, options);
  }

  async planCoordinateTransfer(
    options: PlanCoordinateTransferOptions,
  ): Promise<CoordinateTransferPlanV1> {
    return await planCoordinateTransferImpl(this._host, this._selectorContext, options);
  }

  async compareCoordinates(
    options: CompareCoordinatesOptions,
  ): Promise<CoordinateComparisonV1> {
    return await compareCoordinatesImpl(this._host, this._selectorContext, options);
  }
}
