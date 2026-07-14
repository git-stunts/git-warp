/**
 * Shared helper for opening detached read-only runtime clones.
 *
 * Used by QueryController and MaterializeController for snapshot
 * isolation. Will be replaced by DetachedGraphFactory once DI is wired.
 */
import type BlobStoragePort from '../../../ports/BlobStoragePort.ts';
import type CheckpointStorePort from '../../../ports/CheckpointStorePort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type IndexStorePort from '../../../ports/IndexStorePort.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type PatchJournalPort from '../../../ports/PatchJournalPort.ts';
import type { CorePersistence } from '../../types/WarpPersistence.ts';
import type { NormalizedTrustConfig } from '../../runtimeHelpers.ts';
import type GCPolicy from '../GCPolicy.ts';
import type { DetachedGraphInternalReadSurface } from '../../capabilities/DetachedGraphFactory.ts';
import type RuntimeStorageProviderPort from '../../../ports/RuntimeStorageProviderPort.ts';

export type DetachedOpenOptions = {
  persistence: CorePersistence;
  runtimeStorage: RuntimeStorageProviderPort;
  graphName: string;
  writerId: string;
  gcPolicy: GCPolicy;
  autoMaterialize: false;
  onDeleteWithData: 'reject' | 'cascade' | 'warn';
  crypto: CryptoPort;
  codec: CodecPort;
  audit: false;
  checkpointPolicy?: { every: number };
  logger?: LoggerPort;
  blobStorage?: BlobStoragePort;
  patchBlobStorage?: BlobStoragePort;
  trust?: NormalizedTrustConfig;
  patchJournal?: PatchJournalPort;
  checkpointStore?: CheckpointStorePort;
  indexStore?: IndexStorePort;
};

export type DetachedGraphOpen = (options: DetachedOpenOptions) => Promise<DetachedGraphInternalReadSurface>;

export type DetachedOpenHost = {
  _persistence: CorePersistence;
  _runtimeStorage: RuntimeStorageProviderPort;
  _graphName: string;
  _writerId: string;
  _gcPolicy: GCPolicy;
  _checkpointPolicy: { every: number } | null;
  _logger: LoggerPort | null;
  _blobStorage: BlobStoragePort | null;
  _patchBlobStorage: BlobStoragePort | null;
  _trustConfig: NormalizedTrustConfig;
  _patchJournal: PatchJournalPort;
  _checkpointStore: CheckpointStorePort;
  _indexStore: IndexStorePort;
  _onDeleteWithData: 'reject' | 'cascade' | 'warn';
  _crypto: CryptoPort;
  _codec: CodecPort;
};

function coreOptions(graph: DetachedOpenHost): DetachedOpenOptions {
  return {
    persistence: graph._persistence,
    runtimeStorage: graph._runtimeStorage,
    graphName: graph._graphName,
    writerId: graph._writerId,
    gcPolicy: graph._gcPolicy,
    autoMaterialize: false,
    onDeleteWithData: graph._onDeleteWithData,
    crypto: graph._crypto,
    codec: graph._codec,
    audit: false,
  };
}

function addReadPolicy(opts: DetachedOpenOptions, g: DetachedOpenHost): void {
  if (g._checkpointPolicy) { opts.checkpointPolicy = g._checkpointPolicy; }
  if (g._logger) { opts.logger = g._logger; }
}

function addStoragePorts(opts: DetachedOpenOptions, g: DetachedOpenHost): void {
  if (g._blobStorage) { opts.blobStorage = g._blobStorage; }
  if (g._patchBlobStorage) { opts.patchBlobStorage = g._patchBlobStorage; }
}

function addConfigPorts(opts: DetachedOpenOptions, g: DetachedOpenHost): void {
  if (g._trustConfig !== undefined && g._trustConfig !== null) { opts.trust = g._trustConfig; }
  if (g._patchJournal !== undefined && g._patchJournal !== null) { opts.patchJournal = g._patchJournal; }
}

function addStoresPorts(opts: DetachedOpenOptions, g: DetachedOpenHost): void {
  if (g._checkpointStore !== undefined && g._checkpointStore !== null) { opts.checkpointStore = g._checkpointStore; }
  if (g._indexStore !== undefined && g._indexStore !== null) { opts.indexStore = g._indexStore; }
}

/** Opens a detached read-only clone for snapshot queries. */
export async function openDetachedGraph(
  graph: DetachedOpenHost,
  open: DetachedGraphOpen,
): Promise<DetachedGraphInternalReadSurface> {
  const opts = coreOptions(graph);
  addReadPolicy(opts, graph);
  addStoragePorts(opts, graph);
  addConfigPorts(opts, graph);
  addStoresPorts(opts, graph);
  return await open(opts);
}
