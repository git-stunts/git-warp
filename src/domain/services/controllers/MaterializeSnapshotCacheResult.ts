import AdjacencyMap from '../../capabilities/AdjacencyMap.ts';
import { ProvenanceIndex } from '../provenance/ProvenanceIndex.ts';
import { buildAdjacency } from './MaterializeHelpers.ts';
import type WarpState from '../state/WarpState.ts';
import type { MaterializeResult } from './MaterializeController.ts';
import type {
  WarpStateSnapshotRecord,
} from '../../../ports/WarpStateCachePort.ts';

export type UsableSnapshotRecord = WarpStateSnapshotRecord & {
  state: WarpState;
};

type SnapshotUseOptions = Readonly<{
  receipts: boolean;
}>;

function snapshotHasState(
  snapshot: WarpStateSnapshotRecord | null | undefined,
): snapshot is UsableSnapshotRecord {
  return snapshot !== null && snapshot !== undefined && snapshot.state !== undefined;
}

function receiptsAllowSnapshot(
  snapshot: UsableSnapshotRecord,
  options: SnapshotUseOptions,
): boolean {
  return !options.receipts || snapshot.provenancePosture !== 'degraded';
}

export function canUseSnapshot(
  snapshot: WarpStateSnapshotRecord | null | undefined,
  options: SnapshotUseOptions,
): snapshot is UsableSnapshotRecord {
  if (!snapshotHasState(snapshot)) {
    return false;
  }
  return receiptsAllowSnapshot(snapshot, options);
}

export function snapshotToMaterializeResult(snapshot: UsableSnapshotRecord): MaterializeResult {
  const adjacency = buildAdjacency(snapshot.state);
  return {
    state: snapshot.state,
    stateHash: snapshot.stateHash,
    adjacency: new AdjacencyMap({ outgoing: adjacency.outgoing, incoming: adjacency.incoming }),
    patchCount: 0,
    maxObservedLamport: 0,
    provenanceIndex: new ProvenanceIndex(),
    provenanceDegraded: snapshot.provenancePosture === 'degraded',
    frontier: snapshot.coordinate.frontier,
    ceiling: snapshot.coordinate.ceiling,
  };
}
