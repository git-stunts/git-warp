import type {
  AssetCapability,
  BundleCapability,
  CacheAcquisition,
  CacheEntryMetadata,
  CacheHit,
  CacheSet,
  PageHandle,
  PageCapability,
  WorkspaceRetainedBundle,
  WorkspaceRetainedPage,
} from '@git-stunts/git-cas';
import MaterializationCoordinate from '../../domain/materialization/MaterializationCoordinate.ts';
import MaterializationHandle from '../../domain/materialization/MaterializationHandle.ts';
import MaterializationRoot from '../../domain/materialization/MaterializationRoot.ts';
import MaterializationRoots from '../../domain/materialization/MaterializationRoots.ts';
import type WarpState from '../../domain/services/state/WarpState.ts';
import WarpStream from '../../domain/stream/WarpStream.ts';
import BundleHandle from '../../domain/storage/BundleHandle.ts';
import { collectAsyncIterable } from '../../domain/utils/streamUtils.ts';
import type StorageRetentionWitness from '../../domain/storage/StorageRetentionWitness.ts';
import WarpError from '../../domain/errors/WarpError.ts';
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
import GitCasMaterializationLease from './GitCasMaterializationLease.ts';
import {
  decodeCanonicalWarpFullState,
  encodeWarpFullState,
} from '../codecs/WarpStateCborCodec.ts';
import { computeStateHash } from '../../domain/services/state/StateSerializer.ts';
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
const REPLAY_BASIS_PATH = 'state.cbor';
const MAX_CACHE_INSPECTION_PAGE = 100;
const MAX_MATERIALIZATION_CANDIDATES = 1024;
const LEGACY_MATERIALIZATION_DESCRIPTOR_SCHEMA_VERSIONS = Object.freeze([2, 3]);

type MaterializationCacheSet = Pick<
  CacheSet,
  'acquire' | 'inspect' | 'put' | 'remove' | 'ref'
>;
type MaterializationCachePut = Awaited<ReturnType<MaterializationCacheSet['put']>>;
type MaterializationCandidate = Readonly<{
  coordinate: MaterializationCoordinate;
  createdAt: string;
  key: string;
}>;

export type GitCasMaterializationFacade = {
  readonly assets: Pick<AssetCapability, 'open' | 'put'>;
  readonly bundles: Pick<
    BundleCapability,
    'getMemberReference' | 'iterateMemberReferences' | 'putOrdered'
  >;
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
  }

  override async openWorkspace(
    coordinate: MaterializationCoordinate,
  ): Promise<MaterializationWorkspacePort> {
    requireCoordinate(coordinate);
    const workspace = await this.#cas.workspaces.open({
      namespace: WORKSPACE_NAMESPACE,
      ttlMs: WORKSPACE_TTL_MS,
    });
    return new GitCasMaterializationWorkspace({
      staging: this.#cas,
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
    const roots = await this.#rootsWithReplayBasis(request);
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

  async #rootsWithReplayBasis(
    request: RetainMaterializationRequest,
  ): Promise<MaterializationRoots> {
    if (request.replayBasis === undefined) {
      return request.roots;
    }
    const bytes = encodeWarpFullState(request.replayBasis, this.#codec);
    const asset = await this.#cas.assets.put({
      source: WarpStream.from([bytes]),
      slug: 'git-warp-materialization-replay-basis',
      filename: REPLAY_BASIS_PATH,
    });
    const bundle = await this.#cas.bundles.putOrdered({
      members: [[REPLAY_BASIS_PATH, asset.handle]],
      limits: { maxMembers: 1 },
    });
    return rootsWithReplayBasis(
      request.roots,
      MaterializationRoot.retained(new BundleHandle(bundle.handle.toString())),
    );
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

    const descriptorPage = await this.#cas.pages.put({
      source: descriptorBytes,
      maxBytes: MAX_DESCRIPTOR_BYTES,
    });
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
      await this.#removeLegacyEntries(args.cache, args.coordinate);
    } finally {
      await acquisition.release();
    }
  }

  override async acquireExact(
    coordinate: MaterializationCoordinate,
  ): Promise<MaterializationAcquisition | null> {
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
    if (!(materialization instanceof MaterializationHandle)) {
      throw storageError('replay basis requires a MaterializationHandle');
    }
    const root = materialization.roots.replayBasis;
    if (root.status !== 'retained' || root.handle === null) {
      return null;
    }
    const member = await this.#cas.bundles.getMemberReference({
      handle: root.handle.toString(),
      path: REPLAY_BASIS_PATH,
    });
    if (member === null || member.handle.kind !== 'asset') {
      throw storageError('replay basis root has no state asset');
    }
    const bytes = await collectAsyncIterable(this.#cas.assets.open({
      handle: member.handle,
    }));
    const state = decodeCanonicalWarpFullState(bytes, this.#codec);
    const stateHash = await computeStateHash(state, {
      codec: this.#codec,
      crypto: this.#crypto,
    });
    if (stateHash !== materialization.stateHash) {
      throw storageError('replay basis state hash does not match its descriptor');
    }
    return state;
  }

  override close(): Promise<void> {
    this.#closePromise ??= this.#close();
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
    const candidate = await this.#findBestCompatiblePredecessor(
      coordinate,
      isCompatible,
    );
    if (candidate === null) {
      return null;
    }
    const next = await this.#openLease(candidate);
    return next === null ? null : this.#replaceCurrentLease(next);
  }

  async #findBestCompatiblePredecessor(
    coordinate: MaterializationCoordinate,
    isCompatible: MaterializationPredecessorPredicate,
  ): Promise<MaterializationCoordinate | null> {
    const cache = await this.#cas.caches.open({ namespace: CACHE_NAMESPACE });
    let cursor: string | null = null;
    let inspected = 0;
    let best: MaterializationCandidate | null = null;
    do {
      const page = await cache.inspect({
        limit: MAX_CACHE_INSPECTION_PAGE,
        cursor,
      });
      for (const entry of page.entries) {
        inspected += 1;
        if (inspected > MAX_MATERIALIZATION_CANDIDATES) {
          throw storageError('materialization cache exceeds predecessor scan limit');
        }
        const candidate = await this.#candidateFromEntry(entry, coordinate, isCompatible);
        if (candidate !== null && candidateIsBetter(candidate, best)) {
          best = candidate;
        }
      }
      cursor = page.nextCursor;
    } while (cursor !== null);
    return best?.coordinate ?? null;
  }

  async #candidateFromEntry(
    entry: CacheEntryMetadata,
    target: MaterializationCoordinate,
    isCompatible: MaterializationPredecessorPredicate,
  ): Promise<MaterializationCandidate | null> {
    if (!entry.key.startsWith(`v${String(MATERIALIZATION_DESCRIPTOR_SCHEMA_VERSION)}:`)) {
      return null;
    }
    const bundle = new BundleHandle(entry.handle);
    const members = await this.#readMembers(bundle);
    const descriptor = await this.#readDescriptor(members.descriptor);
    if (
      descriptor.laneName !== this.#laneName
      || descriptor.coordinate.equals(target)
      || descriptor.rootStatuses.get('replay-basis') !== 'retained'
      || entry.key !== await this.#cacheKey(descriptor.coordinate)
      || !await isCompatible(descriptor.coordinate)
    ) {
      return null;
    }
    return Object.freeze({
      coordinate: descriptor.coordinate,
      createdAt: entry.createdAt,
      key: entry.key,
    });
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
      this.#closed = true;
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

  async #removeLegacyEntries(
    cache: MaterializationCacheSet,
    coordinate: MaterializationCoordinate,
  ): Promise<void> {
    for (const schemaVersion of LEGACY_MATERIALIZATION_DESCRIPTOR_SCHEMA_VERSIONS) {
      await cache.remove(await this.#cacheKey(coordinate, schemaVersion));
    }
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

function rootsWithReplayBasis(
  roots: MaterializationRoots,
  replayBasis: MaterializationRoot,
): MaterializationRoots {
  return new MaterializationRoots({
    adjacency: roots.adjacency,
    edgeAlive: roots.edgeAlive,
    edgeBirths: roots.edgeBirths,
    frontier: roots.frontier,
    nodeAlive: roots.nodeAlive,
    properties: roots.properties,
    provenanceSupport: roots.provenanceSupport,
    replayBasis,
    roaringIndexes: roots.roaringIndexes,
  });
}

function candidateIsBetter(
  candidate: MaterializationCandidate,
  current: MaterializationCandidate | null,
): boolean {
  if (current === null || candidate.createdAt > current.createdAt) {
    return true;
  }
  return candidate.createdAt === current.createdAt && candidate.key > current.key;
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
