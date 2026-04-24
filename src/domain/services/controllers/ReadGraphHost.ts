import type BlobStoragePort from '../../../ports/BlobStoragePort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type CommitMessageCodecPort from '../../../ports/CommitMessageCodecPort.ts';
import type GraphPersistencePort from '../../../ports/GraphPersistencePort.ts';
import type NeighborProviderPort from '../../../ports/NeighborProviderPort.ts';
import type { NeighborEdge } from '../../../ports/NeighborProviderPort.ts';
import type WarpState from '../state/WarpState.ts';
import type PropertyIndexReader from '../index/PropertyIndexReader.ts';
import type { LogicalIndex } from '../index/logicalIndexHelpers.ts';
import type { ProvenanceIndex } from '../provenance/ProvenanceIndex.ts';

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
  _blobStorage: BlobStoragePort | null;
  _persistence: Pick<GraphPersistencePort, 'readBlob'>;
};

export type PatchBlobReadHost = {
  _persistence: Pick<GraphPersistencePort, 'getNodeInfo'>;
  _commitMessageCodec: Pick<CommitMessageCodecPort, 'detectKind' | 'decodePatch'>;
  _readPatchBlob(patchMeta: ReturnType<CommitMessageCodecPort['decodePatch']>): Promise<Uint8Array>;
  _codec: CodecPort;
};

export type ProvenanceReadHost = FreshStateHost &
  PatchBlobReadHost & {
    _provenanceDegraded: boolean;
    _provenanceIndex: ProvenanceIndex | null;
  };
