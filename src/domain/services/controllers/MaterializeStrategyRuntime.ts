import type { ProvenanceIndex } from '../provenance/ProvenanceIndex.ts';
import type WarpState from '../state/WarpState.ts';
import type { PatchWithSha } from '../../capabilities/PatchCollector.ts';
import type {
  MaterializePatchStreamOptions,
  MaterializePatchStreamReduction,
} from './MaterializePatchStreamReducer.ts';
import type { MaterializePatchSummary } from './MaterializePatchSummary.ts';
import type { MaterializeSnapshotPublicationOptions } from './MaterializeSnapshotPublication.ts';
import type {
  MaterializeDeps,
  MaterializeResult,
  MaterializeReduceOutput,
} from './MaterializeController.ts';

export type MaterializeLiveOptions = {
  receipts: boolean;
  wantDiff: boolean;
};

export type MaterializeCeilingOptions = {
  ceiling: number;
  receipts: boolean;
};

export type MaterializeCoordinateOptions = {
  frontier: Map<string, string>;
  ceiling: number | null;
  receipts: boolean;
};

export type MaterializeResultBuildInput = {
  reduced: MaterializeReduceOutput;
  summary: MaterializePatchSummary;
  degraded: boolean;
  ceiling: number | null;
  frontier: Map<string, string> | null;
};

export type MaterializeStrategyRuntime = {
  deps: MaterializeDeps;
  emptyResult(
    ceiling?: number | null,
    frontier?: Map<string, string> | null,
    options?: MaterializeSnapshotPublicationOptions,
  ): Promise<MaterializeResult>;
  wrapState(
    state: WarpState,
    ceiling: number | null,
    frontier: Map<string, string> | null,
    options?: MaterializeSnapshotPublicationOptions,
  ): Promise<MaterializeResult>;
  reducePatches(
    patches: PatchWithSha[],
    base: WarpState | undefined,
    opts: { receipts: boolean; wantDiff: boolean },
  ): Promise<MaterializeReduceOutput>;
  reducePatchStream(
    stream: AsyncIterable<PatchWithSha>,
    base: WarpState | undefined,
    opts: MaterializePatchStreamOptions,
    provenanceBase?: ProvenanceIndex,
  ): Promise<MaterializePatchStreamReduction>;
  buildResult(params: MaterializeResultBuildInput): Promise<MaterializeResult>;
  buildProvenance(patches: PatchWithSha[], base?: ProvenanceIndex): ProvenanceIndex;
};
