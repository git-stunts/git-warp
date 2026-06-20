import type { LoadPersistence } from '../state/checkpointLoad.ts';
import type { ProvenanceIndex } from '../provenance/ProvenanceIndex.ts';
import type WarpState from '../state/WarpState.ts';
import type { PatchWithSha } from '../../capabilities/PatchCollector.ts';
import type {
  MaterializeDeps,
  MaterializePersistence,
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
  patches: PatchWithSha[];
  provenance: ProvenanceIndex;
  degraded: boolean;
  ceiling: number | null;
  frontier: Map<string, string> | null;
};

export type MaterializeStrategyRuntime = {
  deps: MaterializeDeps;
  emptyResult(ceiling?: number | null, frontier?: Map<string, string> | null): Promise<MaterializeResult>;
  wrapState(state: WarpState, ceiling: number | null, frontier: Map<string, string> | null): Promise<MaterializeResult>;
  reducePatches(
    patches: PatchWithSha[],
    base: WarpState | undefined,
    opts: { receipts: boolean; wantDiff: boolean },
  ): Promise<MaterializeReduceOutput>;
  buildResult(params: MaterializeResultBuildInput): Promise<MaterializeResult>;
  buildProvenance(patches: PatchWithSha[], base?: ProvenanceIndex): ProvenanceIndex;
  loadPersistence(): MaterializePersistence & LoadPersistence;
};
