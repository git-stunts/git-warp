import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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

const execFileAsync = promisify(execFile);

describe('API: retained materialization resume', () => {
  let repo: Awaited<ReturnType<typeof createTestRepo>> | null = null;
  let providers: RecordingRuntimeStorageProvider[] = [];

  beforeEach(async () => {
    repo = await createTestRepo('retained-materialization-resume');
    providers = [];
  });

  afterEach(async () => {
    const results = await Promise.allSettled(
      providers.map(async (provider) => await provider.close()),
    );
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason as unknown);
    try {
      await repo?.cleanup();
    } catch (error) {
      failures.push(error);
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Retained materialization test cleanup failed');
    }
  });

  it('reopens exact roots without replay in-process and through a fresh runtime adapter', async () => {
    if (repo === null) {
      throw new Error('Test repository is not initialized');
    }
    const firstProvider = recordingProvider(repo, providers);
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
    expect(coldHandle?.roots.properties.status).toBe('empty');

    const sameRuntimeReplay = vi.spyOn(firstRuntime, '_loadPatchChainFromSha');
    const warm = await firstRuntime.materialize();

    expect(sameRuntimeReplay).not.toHaveBeenCalled();
    expect(firstStore.exactLookups).toHaveLength(1);
    expect(firstStore.retainedHandles).toHaveLength(1);
    expect(firstStore.exactHits[0]?.bundle.equals(coldHandle?.bundle)).toBe(true);
    expect(warm).toEqual(cold);

    const reopenedProvider = recordingProvider(repo, providers);
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

  it('answers exact node presence from retained roots after aggressive pruning', async () => {
    if (repo === null) {
      throw new Error('Test repository is not initialized');
    }
    const firstProvider = recordingProvider(repo, providers);
    const firstRuntime = await openRuntime(repo, firstProvider);
    await firstRuntime.patch((patch) => {
      patch.addNode('node:retained');
    });
    await firstRuntime.materialize();

    await execFileAsync('git', [
      '-C',
      repo.tempDir,
      'reflog',
      'expire',
      '--expire=now',
      '--all',
    ]);
    await execFileAsync('git', ['-C', repo.tempDir, 'prune', '--expire=now']);

    const reopenedProvider = recordingProvider(repo, providers);
    const reopenedRuntime = await openRuntime(repo, reopenedProvider);
    const replay = vi.spyOn(reopenedRuntime, '_loadPatchChainFromSha');
    const publishWholeState = vi.spyOn(reopenedRuntime, '_onMaterialized');

    await expect(reopenedRuntime.hasNode('node:retained')).resolves.toBe(true);

    const reopenedStore = requireMaterializations(reopenedProvider);
    expect(replay).not.toHaveBeenCalled();
    expect(publishWholeState).not.toHaveBeenCalled();
    expect(reopenedRuntime._cachedState).toBeNull();
    expect(reopenedStore.exactLookups).toHaveLength(1);
    expect(reopenedStore.exactHits).toHaveLength(1);
    expect(reopenedStore.exactReleaseCount).toBe(1);
  });

  it('answers exact node properties from one retained shard after aggressive pruning', async () => {
    if (repo === null) {
      throw new Error('Test repository is not initialized');
    }
    const firstProvider = recordingProvider(repo, providers);
    const firstRuntime = await openRuntime(repo, firstProvider);
    await firstRuntime.patch((patch) => {
      patch
        .addNode('node:retained')
        .setProperty('node:retained', 'status', 'ready')
        .setProperty('node:retained', 'attempts', 2)
        .setProperty('node:retained', '__proto__', 'retained-data');
    });
    await firstRuntime.materialize();

    const coldHandle = requireMaterializations(firstProvider).retainedHandles[0];
    expect(coldHandle?.roots.properties.status).toBe('retained');

    await execFileAsync('git', [
      '-C',
      repo.tempDir,
      'reflog',
      'expire',
      '--expire=now',
      '--all',
    ]);
    await execFileAsync('git', ['-C', repo.tempDir, 'prune', '--expire=now']);

    const reopenedProvider = recordingProvider(repo, providers);
    const reopenedRuntime = await openRuntime(repo, reopenedProvider);
    const replay = vi.spyOn(reopenedRuntime, '_loadPatchChainFromSha');
    const publishWholeState = vi.spyOn(reopenedRuntime, '_onMaterialized');

    await expect(reopenedRuntime.getNodeProps('node:retained')).resolves.toEqual({
      status: 'ready',
      attempts: 2,
      ['__proto__']: 'retained-data',
    });

    const reopenedStore = requireMaterializations(reopenedProvider);
    expect(replay).not.toHaveBeenCalled();
    expect(publishWholeState).not.toHaveBeenCalled();
    expect(reopenedRuntime._cachedState).toBeNull();
    expect(reopenedStore.exactLookups).toHaveLength(1);
    expect(reopenedStore.exactHits).toHaveLength(1);
    expect(reopenedStore.exactReleaseCount).toBe(1);
  });
});

class RecordingMaterializationStore extends MaterializationStorePort {
  readonly retainRequests: RetainMaterializationRequest[] = [];
  readonly retainedHandles: MaterializationHandle[] = [];
  readonly exactLookups: MaterializationCoordinate[] = [];
  readonly exactHits: MaterializationHandle[] = [];
  exactReleaseCount = 0;
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
      return Object.freeze({
        materialization: acquisition.materialization,
        acquiredAt: acquisition.acquiredAt,
        release: async () => {
          await acquisition.release();
          this.exactReleaseCount += 1;
        },
      });
    }
    return null;
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

  override stagePage(
    ...args: Parameters<MaterializationWorkspacePort['stagePage']>
  ): ReturnType<MaterializationWorkspacePort['stagePage']> {
    return this.#delegate.stagePage(...args);
  }

  override stageOrderedBundle(
    ...args: Parameters<MaterializationWorkspacePort['stageOrderedBundle']>
  ): ReturnType<MaterializationWorkspacePort['stageOrderedBundle']> {
    return this.#delegate.stageOrderedBundle(...args);
  }

  override promote(request: PromoteMaterializationRequest): Promise<MaterializationHandle> {
    return this.#promote(request);
  }

  override release(): Promise<void> {
    return this.#delegate.release();
  }
}

class RecordingRuntimeStorageProvider implements RuntimeStorageProviderPort {
  readonly #delegate: GitCasRepositoryAdapter;
  materializations: RecordingMaterializationStore | null = null;

  constructor(delegate: GitCasRepositoryAdapter) {
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

  close(): Promise<void> {
    return this.#delegate.close();
  }
}

function recordingProvider(
  repo: NonNullable<Awaited<ReturnType<typeof createTestRepo>>>,
  providers: RecordingRuntimeStorageProvider[],
): RecordingRuntimeStorageProvider {
  const provider = new RecordingRuntimeStorageProvider(new GitCasRepositoryAdapter({
    plumbing: repo.plumbing,
    history: repo.persistence,
  }));
  providers.push(provider);
  return provider;
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
