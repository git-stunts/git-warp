import type AssetStoragePort from '../../../ports/AssetStoragePort.ts';
import type CommitMessageCodecPort from '../../../ports/CommitMessageCodecPort.ts';
import type CommitPort from '../../../ports/CommitPort.ts';
import type NeighborProviderPort from '../../../ports/NeighborProviderPort.ts';
import type { NeighborEdge } from '../../../ports/NeighborProviderPort.ts';
import type WarpState from '../state/WarpState.ts';
import type PropertyIndexReader from '../index/PropertyIndexReader.ts';
import type { LogicalIndex } from '../index/logicalIndexHelpers.ts';
import type { ProvenanceIndex } from '../provenance/ProvenanceIndex.ts';
import type Patch from '../../types/Patch.ts';

export type ReadAdjacencyMaps = {
  outgoing: Map<string, readonly NeighborEdge[]> | ReadonlyMap<string, readonly NeighborEdge[]>;
  incoming: Map<string, readonly NeighborEdge[]> | ReadonlyMap<string, readonly NeighborEdge[]>;
};

export type MaterializedReadGraph = {
  state: WarpState;
  stateHash: string;
  adjacency: ReadAdjacencyMaps;
  provider?: NeighborProviderPort;
};

export type FreshStateHost = {
  _ensureFreshState(): Promise<void>;
  _cachedState: WarpState | null;
  _autoMaterialize: boolean;
};

export type QueryReadHost = FreshStateHost & {
  _propertyReader: PropertyIndexReader | null;
  _logicalIndex: LogicalIndex | null;
  _materializedGraph: MaterializedReadGraph | null;
};

export type QueryContentHost = FreshStateHost & {
  _assetStorage: AssetStoragePort | null;
};

export type PatchBlobReadHost = {
  _persistence: Pick<CommitPort, 'getNodeInfo'>;
  _commitMessageCodec: Pick<CommitMessageCodecPort, 'detectKind' | 'decodePatch'>;
  _readPatch(patchMeta: ReturnType<CommitMessageCodecPort['decodePatch']>): Promise<Patch>;
};

export type ProvenanceReadHost = FreshStateHost &
  PatchBlobReadHost & {
    _provenanceDegraded: boolean;
    _provenanceIndex: ProvenanceIndex | null;
  };
