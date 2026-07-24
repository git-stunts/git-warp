import MaterializationCoordinate from '../../materialization/MaterializationCoordinate.ts';
import type MaterializationHandle from '../../materialization/MaterializationHandle.ts';
import type { MaterializationAcquisition } from '../../../ports/MaterializationStorePort.ts';
import type {
  WarpStateCoordinate,
} from '../../../ports/WarpStateCachePort.ts';
import type { PatchWithSha } from '../../capabilities/PatchCollector.ts';
import WarpStream from '../../stream/WarpStream.ts';
import type { MaterializeResult } from './MaterializeController.ts';
import type {
  MaterializeLiveOptions,
  MaterializeStrategyRuntime,
} from './MaterializeStrategyRuntime.ts';
import { releaseAcquisitionAfterFailure } from './MaterializationWorkspaceCleanup.ts';

/** Resolves exact or causally compatible retained materialization state. */
export default class RetainedMaterializationResumeStrategy {
  readonly #runtime: MaterializeStrategyRuntime;

  constructor(runtime: MaterializeStrategyRuntime) {
    this.#runtime = runtime;
  }

  async tryResume(
    coordinate: WarpStateCoordinate,
    options: MaterializeLiveOptions,
  ): Promise<MaterializeResult | null> {
    const exact = await this.#tryExact(coordinate, options);
    return exact ?? await this.#tryPredecessor(coordinate, options);
  }

  async #tryExact(
    coordinate: WarpStateCoordinate,
    options: MaterializeLiveOptions,
  ): Promise<MaterializeResult | null> {
    if (options.receipts) {
      return null;
    }
    const acquisition = await this.#runtime.deps.materializations.acquireExact(
      new MaterializationCoordinate(coordinate),
    );
    if (acquisition === null) {
      return null;
    }
    return await this.#completeAcquisition(
      acquisition,
      async () => await this.#resumeExact(acquisition, coordinate, options),
    );
  }

  async #resumeExact(
    acquisition: MaterializationAcquisition,
    coordinate: WarpStateCoordinate,
    options: MaterializeLiveOptions,
  ): Promise<MaterializeResult | null> {
    const { materialization } = acquisition;
    const basis = await this.#runtime.deps.materializations.loadReplayBasis(materialization);
    if (basis === null) {
      return null;
    }
    const reduction = await this.#runtime.reducePatchStream(
      emptyPatchStream(),
      basis,
      { receipts: false, wantDiff: options.wantDiff },
      coordinate,
      undefined,
      materialization,
    );
    return await this.#runtime.buildResult({
      reduced: reduction.reduced,
      summary: reduction.summary,
      degraded: true,
      ceiling: coordinate.ceiling,
      frontier: coordinate.frontier,
      materialization,
      publishSnapshot: false,
    });
  }

  async #tryPredecessor(
    coordinate: WarpStateCoordinate,
    options: MaterializeLiveOptions,
  ): Promise<MaterializeResult | null> {
    if (options.receipts || options.wantDiff) {
      return null;
    }
    const target = new MaterializationCoordinate(coordinate);
    const acquisition = await this.#runtime.deps.materializations
      .acquireBestCompatiblePredecessor(
        target,
        async (candidate) => await this.#coordinatePrecedes(candidate, target),
      );
    if (acquisition === null) {
      return null;
    }
    return await this.#completeAcquisition(
      acquisition,
      async () => await this.#resumePredecessor(acquisition, coordinate, options),
    );
  }

  async #resumePredecessor(
    acquisition: MaterializationAcquisition,
    coordinate: WarpStateCoordinate,
    options: MaterializeLiveOptions,
  ): Promise<MaterializeResult | null> {
    const { materialization } = acquisition;
    const basis = await this.#runtime.deps.materializations.loadReplayBasis(materialization);
    if (basis === null) {
      return null;
    }
    const reduction = await this.#runtime.reducePatchStream(
      this.#suffixStream(materialization, coordinate),
      basis,
      { receipts: false, wantDiff: false },
      coordinate,
      undefined,
      materialization,
    );
    return await this.#runtime.buildResult({
      reduced: reduction.reduced,
      summary: reduction.summary,
      degraded: true,
      ceiling: coordinate.ceiling,
      frontier: coordinate.frontier,
      ...(options.publishSnapshot === undefined
        ? {}
        : { publishSnapshot: options.publishSnapshot }),
    });
  }

  #suffixStream(
    materialization: MaterializationHandle,
    coordinate: WarpStateCoordinate,
  ): AsyncIterable<PatchWithSha> {
    return this.#runtime.deps.patches.streamForFrontierSinceCoordinate(
      coordinate.frontier,
      coordinate.ceiling,
      {
        frontier: materialization.coordinate.frontier(),
        ceiling: materialization.coordinate.ceiling,
      },
    );
  }

  async #coordinatePrecedes(
    candidate: MaterializationCoordinate,
    target: MaterializationCoordinate,
  ): Promise<boolean> {
    if (!ceilingPrecedes(candidate.ceiling, target.ceiling)) {
      return false;
    }
    const targetFrontier = target.frontier();
    for (const entry of candidate.frontierEntries) {
      if (!await this.#frontierEntryPrecedes(
        entry.writerId,
        entry.patchSha,
        targetFrontier,
      )) {
        return false;
      }
    }
    return true;
  }

  async #frontierEntryPrecedes(
    writerId: string,
    candidateTip: string,
    targetFrontier: ReadonlyMap<string, string>,
  ): Promise<boolean> {
    const targetTip = targetFrontier.get(writerId);
    if (targetTip === undefined) {
      return false;
    }
    return candidateTip === targetTip || await this.#isAncestor(candidateTip, targetTip);
  }

  async #isAncestor(candidate: string, target: string): Promise<boolean> {
    const { patches } = this.#runtime.deps;
    return typeof patches.isAncestor === 'function'
      && await patches.isAncestor(candidate, target);
  }

  async #completeAcquisition(
    acquisition: MaterializationAcquisition,
    operation: () => Promise<MaterializeResult | null>,
  ): Promise<MaterializeResult | null> {
    let result: MaterializeResult | null;
    try {
      result = await operation();
    } catch (raw) {
      await releaseAcquisitionAfterFailure(acquisition, this.#runtime.deps.logger);
      throw raw;
    }
    await acquisition.release();
    return result;
  }
}

function ceilingPrecedes(candidate: number | null, target: number | null): boolean {
  return target === null || (candidate !== null && candidate <= target);
}

function emptyPatchStream(): AsyncIterable<PatchWithSha> {
  return WarpStream.from<PatchWithSha>([]);
}
