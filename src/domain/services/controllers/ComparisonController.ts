/**
 * ComparisonController — substrate-visible coordinate and strand comparison.
 *
 * Thin facade that delegates to ComparisonEngine functions.
 * The controller is bound to a WarpRuntime host instance.
 *
 * @module domain/services/controllers/ComparisonController
 */

import type { ComparisonHost, PatchEntry } from './ComparisonSelector.ts';
import {
  buildPatchDivergenceImpl,
  compareStrandImpl,
  planStrandTransferImpl,
  planCoordinateTransferImpl,
  compareCoordinatesImpl,
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
  ): Record<string, unknown> {
    return buildPatchDivergenceImpl(leftEntries, rightEntries, targetId ?? null);
  }

  async compareStrand(
    strandId: string,
    options: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    return await compareStrandImpl(this._host, strandId, options);
  }

  async planStrandTransfer(
    strandId: string,
    options: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    return await planStrandTransferImpl(this._host, strandId, options);
  }

  async planCoordinateTransfer(
    options: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return await planCoordinateTransferImpl(this._host, options);
  }

  async compareCoordinates(
    options: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return await compareCoordinatesImpl(this._host, options);
  }
}
