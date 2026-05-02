import type { WarpState } from '../JoinReducer.ts';
import type {
  ComparisonRequestedSideV1,
  ComparisonResolvedSideV1,
  PatchEntry,
  StrandComparisonMetadataV1,
} from './ComparisonSelector.ts';

export type ComparisonCoordinateSideRead = {
  readonly requested: ComparisonRequestedSideV1;
  readonly state: WarpState;
  readonly patchEntries: readonly PatchEntry[];
  readonly coordinateKind: ComparisonResolvedSideV1['coordinateKind'];
  readonly lamportCeiling: number | null;
  readonly strand?: StrandComparisonMetadataV1;
};

export type LiveComparisonSideReadRequest = {
  readonly frontier: Map<string, string>;
  readonly ceiling: number | null;
};

export type CoordinateComparisonSideReadRequest = {
  readonly frontier: Record<string, string>;
  readonly ceiling: number | null;
};

export type StrandBaseComparisonSideReadRequest = {
  readonly strandId: string;
  readonly ceiling: number | null;
};

export interface ComparisonCoordinateSideReadPort {
  liveFrontier(): Promise<Map<string, string>>;
  readLiveSide(request: LiveComparisonSideReadRequest): Promise<ComparisonCoordinateSideRead>;
  readCoordinateSide(request: CoordinateComparisonSideReadRequest): Promise<ComparisonCoordinateSideRead>;
  readStrandBaseSide(request: StrandBaseComparisonSideReadRequest): Promise<ComparisonCoordinateSideRead>;
}
