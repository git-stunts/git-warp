/**
 * Factory that assembles a StrandCoordinator from a graph runtime.
 *
 * @module domain/services/strand/createStrandCoordinator
 */

import StrandDescriptorStore from './StrandDescriptorStore.ts';
import StrandMaterializer from './StrandMaterializer.ts';
import StrandPatchService from './StrandPatchService.ts';
import StrandIntentService from './StrandIntentService.ts';
import StrandCoordinator from './StrandCoordinator.ts';
import { frontierRecordsEqual } from './StrandDescriptorValidation.ts';
import { buildIntentId, buildTickId } from './strandShared.ts';
import type { StrandDescriptor } from './strandTypes.ts';
import type { PatchBuilder } from '../PatchBuilder.ts';
import type { ProvenanceIndex } from '../provenance/ProvenanceIndex.ts';
import type { WarpState } from '../JoinReducer.ts';
import type Patch from '../../types/Patch.ts';
import type PatchJournalPort from '../../../ports/PatchJournalPort.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type BlobStoragePort from '../../../ports/BlobStoragePort.ts';

type BaseObservation = {
  coordinateVersion: string;
  frontier: Record<string, string>;
  lamportCeiling: number | null;
};

function baseObservationsEqual(left: BaseObservation, right: BaseObservation): boolean {
  return (
    left.coordinateVersion === right.coordinateVersion
    && left.lamportCeiling === right.lamportCeiling
    && frontierRecordsEqual(left.frontier, right.frontier)
  );
}

type GraphRuntime = {
  _graphName: string;
  _persistence: import('../../../ports/GraphPersistencePort.ts').default;
  _crypto: import('../../../ports/CryptoPort.ts').default;
  // Required by StrandDescriptorStore and StrandMaterializer
  _loadPatchChainFromSha(sha: string): Promise<Array<{ patch: Patch; sha: string }>>;
  // Required by StrandMaterializer
  _maxObservedLamport: number;
  _provenanceIndex: ProvenanceIndex | null;
  _provenanceDegraded: boolean;
  _cachedCeiling: number | null;
  _cachedFrontier: Map<string, string> | null;
  _lastFrontier: Map<string, string> | null;
  _setMaterializedState(state: WarpState): Promise<void>;
  getFrontier(): Promise<Map<string, string>>;
  // Required by StrandPatchService
  _patchInProgress: boolean;
  _stateDirty: boolean;
  _cachedViewHash: string | null;
  _cachedState: WarpState | null;
  _patchJournal: PatchJournalPort | null | undefined;
  _patchBlobStorage: BlobStoragePort | null | undefined;
  _blobStorage: BlobStoragePort | null | undefined;
  _logger: LoggerPort | null | undefined;
  _codec: { encode(v: unknown): Uint8Array };
  _onDeleteWithData: 'reject' | 'cascade' | 'warn';
  [key: string]: unknown;
};

function wireDescriptors(graph: GraphRuntime, ref: { coordinator: StrandCoordinator | null }): StrandDescriptorStore {
  return new StrandDescriptorStore({
    graph,
    loadStrandOrThrow: async (strandId: string) => await ref.coordinator!.getOrThrow(strandId),
    baseObservationsEqual,
  });
}

type SubServices = {
  descriptors: StrandDescriptorStore;
  materializer: StrandMaterializer;
};

function wirePatches(graph: GraphRuntime, ref: { coordinator: StrandCoordinator | null }, subs: SubServices): StrandPatchService {
  return new StrandPatchService({
    graph,
    loadStrandOrThrow: async (strandId: string) => await ref.coordinator!.getOrThrow(strandId),
    materializeDescriptor: async (descriptor: StrandDescriptor, options: { collectReceipts: boolean; ceiling: number | null }) =>
      await subs.materializer.materializeDescriptor(descriptor, options),
    writeDescriptor: async (descriptor: StrandDescriptor) => await subs.descriptors.writeDescriptor(descriptor),
    buildOverlayRef: (strandId: string) => subs.descriptors.buildOverlayRef(strandId),
    normalizeIntentQueue: (value: unknown) => subs.descriptors.normalizeIntentQueue(value),
    buildIntentId,
  });
}

function wireIntents(graph: GraphRuntime, ref: { coordinator: StrandCoordinator | null }, subs: SubServices & { patches: StrandPatchService }): StrandIntentService {
  return new StrandIntentService({
    graph,
    loadStrandOrThrow: async (strandId: string) => await ref.coordinator!.getOrThrow(strandId),
    buildQueuedIntent: async (descriptor: StrandDescriptor, build: (p: PatchBuilder) => void | Promise<void>) =>
      await subs.patches.buildQueuedIntent(descriptor, build),
    normalizeIntentQueue: (value: unknown) => subs.descriptors.normalizeIntentQueue(value),
    normalizeEvolution: (value: unknown) => subs.descriptors.normalizeEvolution(value),
    writeDescriptor: async (descriptor: StrandDescriptor) => await subs.descriptors.writeDescriptor(descriptor),
    commitQueuedPatch: async (params: Parameters<typeof subs.patches.commitQueuedPatch>[0]) =>
      await subs.patches.commitQueuedPatch(params),
    collectPatchEntries: async (descriptor: StrandDescriptor, options: { ceiling: number | null }) =>
      await subs.materializer.collectPatchEntries(descriptor, options),
    buildTickId,
  });
}

/** Creates a StrandCoordinator wired to the given graph runtime. */
export default function createStrandCoordinator(graph: GraphRuntime): StrandCoordinator {
  const ref: { coordinator: StrandCoordinator | null } = { coordinator: null };
  const descriptors = wireDescriptors(graph, ref);
  const materializer = new StrandMaterializer({ graph });
  const patches = wirePatches(graph, ref, { descriptors, materializer });
  const intents = wireIntents(graph, ref, { descriptors, materializer, patches });

  ref.coordinator = new StrandCoordinator({
    graphName: graph._graphName,
    maxObservedLamport: () => graph._maxObservedLamport,
    crypto: graph._crypto,
    persistence: graph._persistence,
    descriptors,
    materializer,
    patches,
    intents,
    graph: graph as Record<string, unknown>,
  });

  return ref.coordinator;
}
