/**
 * ComparisonController — substrate-visible coordinate and strand comparison.
 *
 * Thin facade that delegates to ComparisonEngine functions.
 * The controller is bound to a WarpRuntime host instance.
 *
 * @module domain/services/controllers/ComparisonController
 */

import type {
  CoordinateComparison,
  CoordinateTransferPlan,
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
  type VisiblePatchDivergence,
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
  ): VisiblePatchDivergence {
    return buildPatchDivergenceImpl(leftEntries, rightEntries, targetId ?? null);
  }

  async compareStrand(
    strandId: string,
    options: CompareStrandOptions = {},
  ): Promise<CoordinateComparison> {
    return await compareStrandImpl(this._host, this._selectorContext, strandId, options);
  }

  async planStrandTransfer(
    strandId: string,
    options: PlanStrandTransferOptions = {},
  ): Promise<CoordinateTransferPlan> {
    return await planStrandTransferImpl(this._host, this._selectorContext, strandId, options);
  }

  async planCoordinateTransfer(
    options: PlanCoordinateTransferOptions,
  ): Promise<CoordinateTransferPlan> {
    return await planCoordinateTransferImpl(this._host, this._selectorContext, options);
  }

  async compareCoordinates(
    options: CompareCoordinatesOptions,
  ): Promise<CoordinateComparison> {
    return await compareCoordinatesImpl(this._host, this._selectorContext, options);
  }
}
