/**
 * Factory that assembles a StrandCoordinator from a graph runtime.
 *
 * @module domain/services/strand/createStrandCoordinator
 */

import StrandDescriptorStore from './StrandDescriptorStore.js';
import StrandMaterializer from './StrandMaterializer.js';
import StrandPatchService from './StrandPatchService.js';
import StrandIntentService from './StrandIntentService.js';
import StrandCoordinator from './StrandCoordinator.ts';
import { frontierRecordsEqual } from './StrandDescriptorValidation.ts';
import { buildIntentId, buildTickId } from './strandShared.js';

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
  _clock: import('../../../ports/ClockPort.ts').default;
  _crypto: import('../../../ports/CryptoPort.ts').default;
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
    materializeDescriptor: async (descriptor: unknown, options: unknown) =>
      await subs.materializer.materializeDescriptor(descriptor, options),
    writeDescriptor: async (descriptor: unknown) => await subs.descriptors.writeDescriptor(descriptor),
    buildOverlayRef: (strandId: string) => subs.descriptors.buildOverlayRef(strandId),
    normalizeIntentQueue: (value: unknown) => subs.descriptors.normalizeIntentQueue(value),
    buildIntentId,
  });
}

function wireIntents(graph: GraphRuntime, ref: { coordinator: StrandCoordinator | null }, subs: SubServices & { patches: StrandPatchService }): StrandIntentService {
  return new StrandIntentService({
    graph,
    loadStrandOrThrow: async (strandId: string) => await ref.coordinator!.getOrThrow(strandId),
    buildQueuedIntent: async (descriptor: unknown, build: unknown) =>
      await subs.patches.buildQueuedIntent(descriptor, build),
    normalizeIntentQueue: (value: unknown) => subs.descriptors.normalizeIntentQueue(value),
    normalizeEvolution: (value: unknown) => subs.descriptors.normalizeEvolution(value),
    writeDescriptor: async (descriptor: unknown) => await subs.descriptors.writeDescriptor(descriptor),
    commitQueuedPatch: async (params: unknown) =>
      await subs.patches.commitQueuedPatch(params as Parameters<typeof subs.patches.commitQueuedPatch>[0]),
    collectPatchEntries: async (descriptor: unknown, options: unknown) =>
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
    clock: graph._clock,
    crypto: graph._crypto,
    persistence: graph._persistence,
    descriptors,
    materializer,
    patches,
    intents,
  });

  return ref.coordinator;
}
