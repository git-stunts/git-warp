import type { WarpState } from '../JoinReducer.ts';
import type {
  ComparisonRequestedSide,
  ComparisonResolvedSide,
  PatchEntry,
  StrandComparisonMetadata,
} from './ComparisonSelector.ts';

export type ComparisonCoordinateSideRead = {
  readonly requested: ComparisonRequestedSide;
  readonly state: WarpState;
  readonly patchEntries: readonly PatchEntry[];
  readonly coordinateKind: ComparisonResolvedSide['coordinateKind'];
  readonly lamportCeiling: number | null;
  readonly strand?: StrandComparisonMetadata;
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
