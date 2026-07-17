import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RuntimeHost from '../../../src/domain/RuntimeHost.ts';
import type MaterializationCoordinate from '../../../src/domain/materialization/MaterializationCoordinate.ts';
import type MaterializationHandle from '../../../src/domain/materialization/MaterializationHandle.ts';
import GitCasRepositoryAdapter from '../../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import MaterializationStorePort, {
  type MaterializationAcquisition,
  type RetainMaterializationRequest,
} from '../../../src/ports/MaterializationStorePort.ts';
import MaterializationWorkspacePort, {
  type MaterializationWorkspaceRoots,
  type PromoteMaterializationRequest,
} from '../../../src/ports/MaterializationWorkspacePort.ts';
import type RuntimeStorageProviderPort from '../../../src/ports/RuntimeStorageProviderPort.ts';
import type {
  RuntimeStorageRequest,
  RuntimeStorageServices,
} from '../../../src/ports/RuntimeStorageProviderPort.ts';
import { createTestRepo } from './helpers/setup.ts';

describe('API: retained materialization resume', () => {
  let repo: Awaited<ReturnType<typeof createTestRepo>> | null = null;

  beforeEach(async () => {
    repo = await createTestRepo('retained-materialization-resume');
  });

  afterEach(async () => {
    await repo?.cleanup();
  });

  it('reopens exact roots without replay in-process and through a fresh runtime adapter', async () => {
    if (repo === null) {
      throw new Error('Test repository is not initialized');
    }
    const firstProvider = recordingProvider(repo);
    const firstRuntime = await openRuntime(repo, firstProvider);
    await firstRuntime.patch((patch) => {
      patch.addNode('node:retained');
    });

    const cold = await firstRuntime.materialize();
    const firstStore = requireMaterializations(firstProvider);
    expect(firstStore.retainRequests).toHaveLength(1);
    expect(firstStore.retainedHandles).toHaveLength(1);
    const coldHandle = firstStore.retainedHandles[0];
    expect(coldHandle?.roots.nodeAlive.status).toBe('retained');
    expect(coldHandle?.roots.edgeAlive.status).toBe('empty');

    const sameRuntimeReplay = vi.spyOn(firstRuntime, '_loadPatchChainFromSha');
    const warm = await firstRuntime.materialize();

    expect(sameRuntimeReplay).not.toHaveBeenCalled();
    expect(firstStore.exactLookups).toHaveLength(1);
    expect(firstStore.retainedHandles).toHaveLength(1);
    expect(firstStore.exactHits[0]?.bundle.equals(coldHandle?.bundle)).toBe(true);
    expect(warm).toEqual(cold);

    const reopenedProvider = recordingProvider(repo);
    const reopenedRuntime = await openRuntime(repo, reopenedProvider);
    const reopenedReplay = vi.spyOn(reopenedRuntime, '_loadPatchChainFromSha');
    const reopened = await reopenedRuntime.materialize();
    const reopenedStore = requireMaterializations(reopenedProvider);

    expect(reopenedReplay).not.toHaveBeenCalled();
    expect(reopenedStore.exactLookups).toHaveLength(1);
    expect(reopenedStore.retainRequests).toHaveLength(0);
    expect(reopenedStore.exactHits[0]?.bundle.equals(coldHandle?.bundle)).toBe(true);
    expect(reopened.nodeAlive.contains('node:retained')).toBe(true);
  });
});

class RecordingMaterializationStore extends MaterializationStorePort {
  readonly retainRequests: RetainMaterializationRequest[] = [];
  readonly retainedHandles: MaterializationHandle[] = [];
  readonly exactLookups: MaterializationCoordinate[] = [];
  readonly exactHits: MaterializationHandle[] = [];
  readonly #delegate: MaterializationStorePort;

  constructor(delegate: MaterializationStorePort) {
    super();
    this.#delegate = delegate;
  }

  override async openWorkspace(
    coordinate: MaterializationCoordinate,
  ): Promise<MaterializationWorkspacePort> {
    const workspace = await this.#delegate.openWorkspace(coordinate);
    return new RecordingMaterializationWorkspace(workspace, async (request) => {
      this.retainRequests.push(request);
      const retained = await workspace.promote(request);
      this.retainedHandles.push(retained);
      return retained;
    });
  }

  override async retain(request: RetainMaterializationRequest): Promise<MaterializationHandle> {
    this.retainRequests.push(request);
    const retained = await this.#delegate.retain(request);
    this.retainedHandles.push(retained);
    return retained;
  }

  override async acquireExact(
    coordinate: MaterializationCoordinate,
  ): Promise<MaterializationAcquisition | null> {
    this.exactLookups.push(coordinate);
    const acquisition = await this.#delegate.acquireExact(coordinate);
    if (acquisition !== null) {
      this.exactHits.push(acquisition.materialization);
    }
    return acquisition;
  }
}

class RecordingMaterializationWorkspace extends MaterializationWorkspacePort {
  readonly #delegate: MaterializationWorkspacePort;
  readonly #promote: (
    request: PromoteMaterializationRequest,
  ) => Promise<MaterializationHandle>;

  constructor(
    delegate: MaterializationWorkspacePort,
    promote: (
      request: PromoteMaterializationRequest,
    ) => Promise<MaterializationHandle>,
  ) {
    super();
    this.#delegate = delegate;
    this.#promote = promote;
  }

  override checkpoint(roots: MaterializationWorkspaceRoots) {
    return this.#delegate.checkpoint(roots);
  }

  override promote(request: PromoteMaterializationRequest): Promise<MaterializationHandle> {
    return this.#promote(request);
  }

  override release(): Promise<void> {
    return this.#delegate.release();
  }
}

class RecordingRuntimeStorageProvider implements RuntimeStorageProviderPort {
  readonly #delegate: RuntimeStorageProviderPort;
  materializations: RecordingMaterializationStore | null = null;

  constructor(delegate: RuntimeStorageProviderPort) {
    this.#delegate = delegate;
  }

  async createRuntimeStorageServices(
    request: RuntimeStorageRequest,
  ): Promise<RuntimeStorageServices> {
    const services = await this.#delegate.createRuntimeStorageServices(request);
    const materializations = new RecordingMaterializationStore(services.materializations);
    this.materializations = materializations;
    return Object.freeze({ ...services, materializations });
  }
}

function recordingProvider(
  repo: NonNullable<Awaited<ReturnType<typeof createTestRepo>>>,
): RecordingRuntimeStorageProvider {
  return new RecordingRuntimeStorageProvider(new GitCasRepositoryAdapter({
    plumbing: repo.plumbing,
    history: repo.persistence,
  }));
}

async function openRuntime(
  repo: NonNullable<Awaited<ReturnType<typeof createTestRepo>>>,
  runtimeStorage: RuntimeStorageProviderPort,
): Promise<RuntimeHost> {
  return await RuntimeHost.open({
    persistence: repo.persistence,
    runtimeStorage,
    graphName: 'events',
    writerId: 'writer-1',
    codec: repo.codec,
    crypto: repo.crypto,
  });
}

function requireMaterializations(
  provider: RecordingRuntimeStorageProvider,
): RecordingMaterializationStore {
  if (provider.materializations === null) {
    throw new Error('Runtime storage services were not created');
  }
  return provider.materializations;
}
