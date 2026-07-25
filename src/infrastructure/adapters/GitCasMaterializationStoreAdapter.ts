import type {
  CacheAcquisition,
  CacheHit,
  PageHandle,
  WorkspaceRetainedBundle,
} from '@git-stunts/git-cas';
import type MaterializationCoordinate from '../../domain/materialization/MaterializationCoordinate.ts';
import MaterializationHandle from '../../domain/materialization/MaterializationHandle.ts';
import type WarpState from '../../domain/services/state/WarpState.ts';
import BundleHandle from '../../domain/storage/BundleHandle.ts';
import type StorageRetentionWitness from '../../domain/storage/StorageRetentionWitness.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import type MaterializationWorkspacePort from '../../ports/MaterializationWorkspacePort.ts';
import MaterializationStorePort, {
  type MaterializationAcquisition,
  type MaterializationPredecessorPredicate,
  type RetainMaterializationRequest,
} from '../../ports/MaterializationStorePort.ts';
import { adaptGitCasRetentionWitness } from './GitCasRetentionWitnessAdapter.ts';
import GitCasMaterializationWorkspace, {
  type GitCasStagingWorkspace,
} from './GitCasMaterializationWorkspace.ts';
import GitCasMaterializationWorkspaceOwner from './GitCasMaterializationWorkspaceOwner.ts';
import {
  requireAdapterOptions,
  requireCoordinate,
  requireDependency,
  requireNonEmpty,
  requireRetainRequest,
  storageError,
} from './GitCasMaterializationStoreValidation.ts';
import GitCasMaterializationLease from './GitCasMaterializationLease.ts';
import GitCasMaterializationPredecessorResolver from './GitCasMaterializationPredecessorResolver.ts';
import GitCasMaterializationReplayBasis, {
  replaceReplayBasisRoot,
} from './GitCasMaterializationReplayBasis.ts';
import GitCasMaterializationCacheKey from './GitCasMaterializationCacheKey.ts';
import type { GitCasMaterializationFacade } from './GitCasMaterializationStoreTypes.ts';
import {
  releaseCacheAcquisitionAfterFailure,
  requireDescriptorSize,
  requireStoredMaterialization,
  requireWorkspaceStage,
} from './GitCasMaterializationStoreWitness.ts';
import { completeWithCleanup } from './OperationCleanup.ts';
import {
  decodeMaterializationDescriptor,
  materializationDescriptorData,
  materializationRootsFromDescriptor,
  type DecodedMaterializationDescriptor,
} from './GitCasMaterializationDescriptor.ts';
import {
  decodeMaterializationMembers,
  materializationMembers,
  type DecodedMaterializationMembers,
} from './GitCasMaterializationBundle.ts';
import GitCasMaterializationProvenanceSupport, {
  replaceProvenanceSupportRoot,
} from './GitCasMaterializationProvenanceSupport.ts';

const CACHE_NAMESPACE = 'git-warp/materializations';
const WORKSPACE_NAMESPACE = 'git-warp/materializations';
const WORKSPACE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_DESCRIPTOR_BYTES = 1024 * 1024;

export type { GitCasMaterializationFacade } from './GitCasMaterializationStoreTypes.ts';

type MaterializationStoreOptions = {
  readonly cas: GitCasMaterializationFacade;
  readonly codec: CodecPort;
  readonly crypto: CryptoPort;
  readonly laneName: string;
  readonly onClose?: () => void;
};

/** git-cas-backed retained materialization lifecycle. */
export default class GitCasMaterializationStoreAdapter extends MaterializationStorePort {
  readonly #cas: GitCasMaterializationFacade;
  readonly #codec: CodecPort;
  readonly #crypto: CryptoPort;
  readonly #cacheKeys: GitCasMaterializationCacheKey;
  readonly #laneName: string;
  readonly #onClose: () => void;
  readonly #predecessorResolver: GitCasMaterializationPredecessorResolver;
  readonly #replayBasis: GitCasMaterializationReplayBasis;
  readonly #provenanceSupport: GitCasMaterializationProvenanceSupport;
  #currentLease: GitCasMaterializationLease | null = null;
  #leaseMutation: Promise<void> = Promise.resolve();
  readonly #retirements = new Set<Promise<void>>();
  readonly #workspaceOwner = new GitCasMaterializationWorkspaceOwner(
    () => storageError('adapter is closed'),
  );
  #retirementFailure: Readonly<{ cause: unknown }> | null = null;
  #closed = false;
  #closePromise: Promise<void> | null = null;

  constructor(options: MaterializationStoreOptions) {
    super();
    requireAdapterOptions(options);
    requireDependency(options.cas, 'cas');
    requireDependency(options.codec, 'codec');
    requireDependency(options.crypto, 'crypto');
    this.#cas = options.cas;
    this.#codec = options.codec;
    this.#crypto = options.crypto;
    this.#laneName = requireNonEmpty(options.laneName, 'laneName');
    this.#cacheKeys = new GitCasMaterializationCacheKey({
      codec: this.#codec,
      crypto: this.#crypto,
      laneName: this.#laneName,
    });
    this.#onClose = options.onClose ?? (() => undefined);
    const support = materializationSupport(options);
    this.#replayBasis = support.replayBasis;
    this.#provenanceSupport = support.provenance;
    this.#predecessorResolver = this.#createPredecessorResolver();
  }

  #createPredecessorResolver(): GitCasMaterializationPredecessorResolver {
    return new GitCasMaterializationPredecessorResolver({
      openCache: async () => await this.#cas.caches.open({ namespace: CACHE_NAMESPACE }),
      laneName: this.#laneName,
      readDescriptor: async (bundle) => {
        const members = await this.#readMembers(bundle);
        return await this.#readDescriptor(members.descriptor);
      },
      cacheKey: async (coordinate) => await this.#cacheKeys.forCoordinate(coordinate),
      cacheKeyPrefix: async () => await this.#cacheKeys.currentPrefix(),
    });
  }

  override async openWorkspace(
    coordinate: MaterializationCoordinate,
  ): Promise<MaterializationWorkspacePort> {
    this.#assertOpen();
    requireCoordinate(coordinate);
    return await this.#workspaceOwner.open({
      open: async () => await this.#cas.workspaces.open({
        namespace: WORKSPACE_NAMESPACE,
        ttlMs: WORKSPACE_TTL_MS,
      }),
      create: (workspace, onRelease) => new GitCasMaterializationWorkspace({
        workspace,
        promote: async (activeWorkspace, request) => {
          if (!request.coordinate.equals(coordinate)) {
            throw storageError('workspace promotion coordinate does not match its open coordinate');
          }
          return await this.#promoteWorkspace(activeWorkspace, request);
        },
        onRelease,
      }),
    });
  }

  override async retain(request: RetainMaterializationRequest): Promise<MaterializationHandle> {
    this.#assertOpen();
    requireRetainRequest(request);
    const workspace = await this.openWorkspace(request.coordinate);
    return await completeWithCleanup(
      async () => await workspace.promote(request),
      async () => await workspace.release(),
      'Materialization promotion and workspace release both failed',
    );
  }

  async #promoteWorkspace(
    workspace: GitCasStagingWorkspace,
    request: RetainMaterializationRequest,
  ): Promise<MaterializationHandle> {
    requireRetainRequest(request);
    const { stateHash } = request;
    const roots = await this.#prepareRetainedRoots(workspace, request);
    const retainedRequest = { ...request, roots };
    const bundle = await this.#stageWorkspaceBundle(workspace, retainedRequest, stateHash);
    const retention = await this.#promoteWorkspaceBundle(
      workspace,
      bundle,
      request.coordinate,
    );
    return new MaterializationHandle({
      laneName: this.#laneName,
      bundle: new BundleHandle(bundle.handle.toString()),
      coordinate: request.coordinate,
      roots,
      stateHash,
      retention,
    });
  }

  async #prepareRetainedRoots(
    workspace: GitCasStagingWorkspace,
    request: RetainMaterializationRequest,
  ) {
    const replayRoots = request.replayBasis === undefined
      ? request.roots
      : replaceReplayBasisRoot(
        request.roots,
        await this.#replayBasis.stage(workspace, request.replayBasis),
      );
    return request.provenanceSupport === undefined
      ? replayRoots
      : replaceProvenanceSupportRoot(
        replayRoots,
        await this.#provenanceSupport.stage(workspace, request.provenanceSupport),
      );
  }

  async #stageWorkspaceBundle(
    workspace: GitCasStagingWorkspace,
    request: RetainMaterializationRequest,
    stateHash: string | null,
  ): Promise<WorkspaceRetainedBundle> {
    const descriptorBytes = this.#codec.encode(materializationDescriptorData({
      coordinate: request.coordinate,
      stateHash,
      laneName: this.#laneName,
      roots: request.roots,
    }));
    requireDescriptorSize(descriptorBytes);

    const descriptorPage = await workspace.pages.put({
      source: descriptorBytes,
      maxBytes: MAX_DESCRIPTOR_BYTES,
    });
    requireWorkspaceStage(descriptorPage);
    const bundle = await workspace.bundles.putOrdered({
      members: materializationMembers(descriptorPage.handle.toString(), request.roots),
    });
    requireWorkspaceStage(bundle);
    return bundle;
  }

  async #promoteWorkspaceBundle(
    workspace: GitCasStagingWorkspace,
    bundle: WorkspaceRetainedBundle,
    coordinate: MaterializationCoordinate,
  ): Promise<StorageRetentionWitness> {
    const cache = await this.#cas.caches.open({ namespace: CACHE_NAMESPACE });
    const cacheKey = await this.#cacheKeys.forCoordinate(coordinate);
    const expectedHandle = bundle.handle.toString();
    const promoted = await workspace.promoteToCache({
      cache,
      key: cacheKey,
      handle: bundle.handle,
      options: { retention: 'evictable' },
    });
    const retention = requireStoredMaterialization(promoted.destination, expectedHandle);
    return adaptGitCasRetentionWitness(retention.toJSON());
  }

  override async acquireExact(
    coordinate: MaterializationCoordinate,
  ): Promise<MaterializationAcquisition | null> {
    this.#assertOpen();
    requireCoordinate(coordinate);
    return await this.#withLeaseMutation(
      async () => await this.#acquireExactLocked(coordinate),
    );
  }

  override async acquireBestCompatiblePredecessor(
    coordinate: MaterializationCoordinate,
    isCompatible: MaterializationPredecessorPredicate,
  ): Promise<MaterializationAcquisition | null> {
    requireCoordinate(coordinate);
    if (typeof isCompatible !== 'function') {
      throw storageError('predecessor compatibility predicate must be a function');
    }
    return await this.#withLeaseMutation(
      async () => await this.#acquireBestCompatiblePredecessorLocked(
        coordinate,
        isCompatible,
      ),
    );
  }

  override async loadReplayBasis(
    materialization: MaterializationHandle,
  ): Promise<WarpState | null> {
    return await this.#replayBasis.load(materialization);
  }

  override close(): Promise<void> {
    if (this.#closePromise === null) {
      this.#closed = true;
      this.#closePromise = this.#close().finally(this.#onClose);
    }
    return this.#closePromise;
  }

  async #acquireExactLocked(
    coordinate: MaterializationCoordinate,
  ): Promise<MaterializationAcquisition | null> {
    if (this.#closed) {
      throw storageError('adapter is closed');
    }
    if (this.#currentLease?.coordinate.equals(coordinate) === true) {
      return this.#currentLease.acquire();
    }

    const next = await this.#openLease(coordinate);
    if (next === null) {
      return null;
    }
    return this.#replaceCurrentLease(next);
  }

  async #acquireBestCompatiblePredecessorLocked(
    coordinate: MaterializationCoordinate,
    isCompatible: MaterializationPredecessorPredicate,
  ): Promise<MaterializationAcquisition | null> {
    if (this.#closed) {
      throw storageError('adapter is closed');
    }
    const candidate = await this.#predecessorResolver.find(
      coordinate,
      isCompatible,
    );
    if (candidate === null) {
      return null;
    }
    const next = await this.#openLease(candidate);
    return next === null ? null : this.#replaceCurrentLease(next);
  }

  #replaceCurrentLease(next: GitCasMaterializationLease): MaterializationAcquisition {
    const previous = this.#currentLease;
    this.#currentLease = next;
    const acquisition = next.acquire();
    if (previous !== null) {
      this.#retireLease(previous);
    }
    return acquisition;
  }

  async #openLease(
    coordinate: MaterializationCoordinate,
  ): Promise<GitCasMaterializationLease | null> {
    const cache = await this.#cas.caches.open({ namespace: CACHE_NAMESPACE });
    const acquisition = await cache.acquire(await this.#cacheKeys.forCoordinate(coordinate));
    if (acquisition === null) {
      return null;
    }
    try {
      if (acquisition.hit.handle.kind !== 'bundle') {
        throw storageError('cache entry does not reference a materialization bundle');
      }
      const materialization = await this.#resolveHit(
        acquisition.hit,
        acquisition.evidence,
        coordinate,
      );
      return new GitCasMaterializationLease({
        acquisition,
        coordinate,
        materialization,
      });
    } catch (raw) {
      await releaseCacheAcquisitionAfterFailure(acquisition);
      throw raw;
    }
  }

  async #close(): Promise<void> {
    const failures: unknown[] = [];
    try {
      await this.#workspaceOwner.close();
    } catch (error) {
      failures.push(error);
    }

    await this.#withLeaseMutation(() => {
      if (this.#currentLease !== null) {
        this.#retireLease(this.#currentLease);
        this.#currentLease = null;
      }
      return Promise.resolve();
    });
    await Promise.allSettled([...this.#retirements]);
    if (this.#retirementFailure !== null) {
      failures.push(this.#retirementFailure.cause);
    }
    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Materialization storage failed to close cleanly');
    }
  }

  #retireLease(lease: GitCasMaterializationLease): void {
    const retirement = lease.retire();
    this.#retirements.add(retirement);
    void retirement.then(
      () => {
        this.#retirements.delete(retirement);
      },
      (cause: unknown) => {
        this.#retirements.delete(retirement);
        this.#retirementFailure ??= Object.freeze({ cause });
      },
    );
  }

  async #withLeaseMutation<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#leaseMutation;
    const turn = Promise.withResolvers<void>();
    this.#leaseMutation = turn.promise;
    await previous;
    try {
      return await operation();
    } finally {
      turn.resolve();
    }
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw storageError('adapter is closed');
    }
  }

  async #resolveHit(
    hit: CacheHit,
    retention: CacheAcquisition['evidence'],
    requestedCoordinate: MaterializationCoordinate,
  ): Promise<MaterializationHandle> {
    const bundle = new BundleHandle(hit.handle.toString());
    const members = await this.#readMembers(bundle);
    const descriptor = await this.#readDescriptor(members.descriptor);
    if (descriptor.laneName !== this.#laneName) {
      throw storageError('materialization descriptor belongs to another lane');
    }
    if (!descriptor.coordinate.equals(requestedCoordinate)) {
      throw storageError('materialization descriptor coordinate does not match its cache key');
    }

    return new MaterializationHandle({
      laneName: descriptor.laneName,
      bundle,
      coordinate: descriptor.coordinate,
      roots: materializationRootsFromDescriptor(descriptor, members.retainedRoots),
      stateHash: descriptor.stateHash,
      retention: adaptGitCasRetentionWitness(retention.toJSON()),
    });
  }

  async #readDescriptor(handle: PageHandle): Promise<DecodedMaterializationDescriptor> {
    const bytes = await this.#cas.pages.get({
      handle,
      maxBytes: MAX_DESCRIPTOR_BYTES,
    });
    return decodeMaterializationDescriptor(this.#codec.decode(bytes));
  }

  async #readMembers(bundle: BundleHandle): Promise<DecodedMaterializationMembers> {
    return await decodeMaterializationMembers(this.#cas.bundles.iterateMemberReferences({
      handle: bundle.toString(),
    }));
  }
}

function materializationSupport(options: MaterializationStoreOptions) {
  return {
    replayBasis: new GitCasMaterializationReplayBasis({
      cas: options.cas,
      codec: options.codec,
      crypto: options.crypto,
    }),
    provenance: new GitCasMaterializationProvenanceSupport({
      cas: options.cas,
      codec: options.codec,
    }),
  };
}
