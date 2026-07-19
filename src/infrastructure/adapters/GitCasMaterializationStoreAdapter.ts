import type {
  BundleCapability,
  CacheAcquisition,
  CacheHit,
  CacheSet,
  PageHandle,
  PageCapability,
  WorkspaceRetainedBundle,
  WorkspaceRetainedPage,
} from '@git-stunts/git-cas';
import MaterializationCoordinate from '../../domain/materialization/MaterializationCoordinate.ts';
import MaterializationHandle from '../../domain/materialization/MaterializationHandle.ts';
import MaterializationRoots from '../../domain/materialization/MaterializationRoots.ts';
import BundleHandle from '../../domain/storage/BundleHandle.ts';
import type StorageRetentionWitness from '../../domain/storage/StorageRetentionWitness.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import type MaterializationWorkspacePort from '../../ports/MaterializationWorkspacePort.ts';
import MaterializationStorePort, {
  type MaterializationAcquisition,
  type RetainMaterializationRequest,
} from '../../ports/MaterializationStorePort.ts';
import { adaptGitCasRetentionWitness } from './GitCasRetentionWitnessAdapter.ts';
import GitCasMaterializationWorkspace, {
  type GitCasStagingWorkspace,
} from './GitCasMaterializationWorkspace.ts';
import GitCasMaterializationLease from './GitCasMaterializationLease.ts';
import {
  decodeMaterializationDescriptor,
  MATERIALIZATION_DESCRIPTOR_SCHEMA_VERSION,
  materializationCoordinateData,
  materializationDescriptorData,
  materializationRootsFromDescriptor,
  type DecodedMaterializationDescriptor,
} from './GitCasMaterializationDescriptor.ts';
import {
  decodeMaterializationMembers,
  materializationMembers,
  type DecodedMaterializationMembers,
} from './GitCasMaterializationBundle.ts';

const CACHE_NAMESPACE = 'git-warp/materializations';
const WORKSPACE_NAMESPACE = 'git-warp/materializations';
const WORKSPACE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_DESCRIPTOR_BYTES = 1024 * 1024;
const LEGACY_MATERIALIZATION_DESCRIPTOR_SCHEMA_VERSION = 2;

type MaterializationCacheSet = Pick<CacheSet, 'acquire' | 'put' | 'remove' | 'ref'>;
type MaterializationCachePut = Awaited<ReturnType<MaterializationCacheSet['put']>>;

export type GitCasMaterializationFacade = {
  readonly bundles: Pick<BundleCapability, 'iterateMemberReferences' | 'putOrdered'>;
  readonly caches: {
    open(options: { readonly namespace: string }): Promise<MaterializationCacheSet>;
  };
  readonly pages: Pick<PageCapability, 'get' | 'put'>;
  readonly workspaces: {
    open(options: {
      readonly namespace: string;
      readonly ttlMs?: number;
    }): Promise<GitCasStagingWorkspace>;
  };
};

/** git-cas-backed retained materialization lifecycle. */
export default class GitCasMaterializationStoreAdapter extends MaterializationStorePort {
  readonly #cas: GitCasMaterializationFacade;
  readonly #codec: CodecPort;
  readonly #crypto: CryptoPort;
  readonly #laneName: string;
  readonly #onClose: () => void;
  #currentLease: GitCasMaterializationLease | null = null;
  #leaseMutation: Promise<void> = Promise.resolve();
  readonly #retirements = new Set<Promise<void>>();
  #retirementFailure: Readonly<{ cause: unknown }> | null = null;
  #closed = false;
  #closePromise: Promise<void> | null = null;

  constructor(options: {
    readonly cas: GitCasMaterializationFacade;
    readonly codec: CodecPort;
    readonly crypto: CryptoPort;
    readonly laneName: string;
    readonly onClose?: () => void;
  }) {
    super();
    requireAdapterOptions(options);
    requireDependency(options.cas, 'cas');
    requireDependency(options.codec, 'codec');
    requireDependency(options.crypto, 'crypto');
    this.#cas = options.cas;
    this.#codec = options.codec;
    this.#crypto = options.crypto;
    this.#laneName = requireNonEmpty(options.laneName, 'laneName');
    this.#onClose = options.onClose ?? (() => undefined);
  }

  override async openWorkspace(
    coordinate: MaterializationCoordinate,
  ): Promise<MaterializationWorkspacePort> {
    this.#assertOpen();
    requireCoordinate(coordinate);
    const workspace = await this.#cas.workspaces.open({
      namespace: WORKSPACE_NAMESPACE,
      ttlMs: WORKSPACE_TTL_MS,
    });
    return new GitCasMaterializationWorkspace({
      workspace,
      promote: async (activeWorkspace, request) => {
        if (!request.coordinate.equals(coordinate)) {
          throw storageError('workspace promotion coordinate does not match its open coordinate');
        }
        return await this.#promoteWorkspace(activeWorkspace, request);
      },
    });
  }

  override async retain(request: RetainMaterializationRequest): Promise<MaterializationHandle> {
    this.#assertOpen();
    requireRetainRequest(request);
    const workspace = await this.openWorkspace(request.coordinate);
    try {
      return await workspace.promote(request);
    } finally {
      await workspace.release();
    }
  }

  async #promoteWorkspace(
    workspace: GitCasStagingWorkspace,
    request: RetainMaterializationRequest,
  ): Promise<MaterializationHandle> {
    requireRetainRequest(request);
    const stateHash = requireNonEmpty(request.stateHash, 'stateHash');
    const bundle = await this.#stageWorkspaceBundle(workspace, request, stateHash);
    const retention = await this.#promoteWorkspaceBundle(
      workspace,
      bundle,
      request.coordinate,
    );
    return new MaterializationHandle({
      laneName: this.#laneName,
      bundle: new BundleHandle(bundle.handle.toString()),
      coordinate: request.coordinate,
      roots: request.roots,
      stateHash,
      retention,
    });
  }

  async #stageWorkspaceBundle(
    workspace: GitCasStagingWorkspace,
    request: RetainMaterializationRequest,
    stateHash: string,
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
    const cacheKey = await this.#cacheKey(coordinate);
    const expectedHandle = bundle.handle.toString();
    const promoted = await workspace.promoteToCache({
      cache,
      key: cacheKey,
      handle: bundle.handle,
      options: { retention: 'evictable' },
    });
    const retention = requireStoredMaterialization(promoted.destination, expectedHandle);
    await this.#cleanLegacyAfterPromotion({ cache, cacheKey, expectedHandle, coordinate });
    return adaptGitCasRetentionWitness(retention.toJSON());
  }

  async #cleanLegacyAfterPromotion(args: {
    cache: MaterializationCacheSet;
    cacheKey: string;
    expectedHandle: string;
    coordinate: MaterializationCoordinate;
  }): Promise<void> {
    const acquisition = await args.cache.acquire(args.cacheKey);
    if (acquisition === null) {
      throw storageError('git-cas lost the retained materialization before legacy cleanup');
    }
    try {
      requireExpectedAcquisition(acquisition, args.expectedHandle);
      await this.#removeLegacyEntry(args.cache, args.coordinate);
    } finally {
      await acquisition.release();
    }
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
    const acquisition = await cache.acquire(await this.#cacheKey(coordinate));
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
    await this.#withLeaseMutation(() => {
      if (this.#currentLease !== null) {
        this.#retireLease(this.#currentLease);
        this.#currentLease = null;
      }
      return Promise.resolve();
    });
    await Promise.allSettled([...this.#retirements]);
    if (this.#retirementFailure !== null) {
      throw this.#retirementFailure.cause;
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

  async #cacheKey(
    coordinate: MaterializationCoordinate,
    schemaVersion = MATERIALIZATION_DESCRIPTOR_SCHEMA_VERSION,
  ): Promise<string> {
    const encoded = this.#codec.encode({
      schemaVersion,
      laneName: this.#laneName,
      coordinate: materializationCoordinateData(coordinate),
    });
    const digest = requireNonEmpty(
      await this.#crypto.hash('sha256', encoded),
      'coordinate digest',
    );
    return `v${String(schemaVersion)}:${digest}`;
  }

  async #removeLegacyEntry(
    cache: MaterializationCacheSet,
    coordinate: MaterializationCoordinate,
  ): Promise<void> {
    const key = await this.#cacheKey(
      coordinate,
      LEGACY_MATERIALIZATION_DESCRIPTOR_SCHEMA_VERSION,
    );
    await cache.remove(key);
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

async function releaseCacheAcquisitionAfterFailure(
  acquisition: CacheAcquisition,
): Promise<void> {
  try {
    await acquisition.release();
  } catch {
    // git-cas doctor owns abandoned-acquisition diagnostics; preserve the primary failure.
  }
}

function requireWorkspaceStage(
  staged: WorkspaceRetainedPage | WorkspaceRetainedBundle,
): void {
  const valid = [
    staged.state === 'retained',
    staged.retention.policy === 'evictable',
    staged.retention.reachability === 'anchored',
    staged.retention.protection === 'workspace',
    staged.witness.handle.toString() === staged.handle.toString(),
    staged.witness.root.kind === 'root-set',
  ];
  if (valid.includes(false)) {
    throw storageError('git-cas did not retain a staged materialization artifact');
  }
}

function requireStoredMaterialization(
  stored: MaterializationCachePut,
  expectedHandle: string,
): Exclude<MaterializationCachePut['witness'], null> {
  if (!stored.accepted || stored.hit === null || stored.witness === null) {
    throw storageError('git-cas did not retain the materialization bundle');
  }
  if (stored.hit.handle.toString() !== expectedHandle) {
    throw storageError('git-cas retained an unexpected materialization handle');
  }
  return stored.witness;
}

function requireExpectedAcquisition(
  acquisition: CacheAcquisition,
  expectedHandle: string,
): void {
  if (acquisition.hit.handle.toString() !== expectedHandle) {
    throw storageError('git-cas acquired an unexpected materialization before legacy cleanup');
  }
}

function requireRetainRequest(request: RetainMaterializationRequest): void {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    throw storageError('retain request must be an object');
  }
  requireCoordinate(request.coordinate);
  if (!(request.roots instanceof MaterializationRoots)) {
    throw storageError('retain request roots have an invalid runtime identity');
  }
  requireCurrentPropertyRoot(request.roots);
}

function requireCurrentPropertyRoot(roots: MaterializationRoots): void {
  if (roots.properties.status === 'unavailable') {
    throw storageError('current materialization profile requires a property root');
  }
}

function requireCoordinate(coordinate: MaterializationCoordinate): void {
  if (!(coordinate instanceof MaterializationCoordinate)) {
    throw storageError('coordinate has an invalid runtime identity');
  }
}

function requireDescriptorSize(bytes: Uint8Array): void {
  if (bytes.byteLength > MAX_DESCRIPTOR_BYTES) {
    throw storageError('materialization descriptor exceeds its byte limit');
  }
}

function requireDependency(value: object, field: string): void {
  if (value === null || typeof value !== 'object') {
    throw storageError(`${field} dependency is required`);
  }
}

function requireAdapterOptions(options: object): void {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw storageError('adapter options must be an object');
  }
}

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw storageError(`${field} must be a non-empty string`);
  }
  return value;
}

function storageError(message: string): WarpError {
  return new WarpError(`Materialization storage ${message}`, 'E_MATERIALIZATION_STORAGE');
}
