import type {
  BundleCapability,
  BundleMember,
  BundleMemberInput,
  CacheHit,
  CacheSet,
  PageHandle,
  PageCapability,
  StagedBundle,
} from '@git-stunts/git-cas';
import MaterializationCoordinate from '../../domain/materialization/MaterializationCoordinate.ts';
import MaterializationHandle from '../../domain/materialization/MaterializationHandle.ts';
import type MaterializationRoot from '../../domain/materialization/MaterializationRoot.ts';
import MaterializationRoots, {
  MATERIALIZATION_ROOT_NAMES,
  type MaterializationRootName,
} from '../../domain/materialization/MaterializationRoots.ts';
import BundleHandle from '../../domain/storage/BundleHandle.ts';
import type StorageRetentionWitness from '../../domain/storage/StorageRetentionWitness.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import MaterializationStorePort, {
  type RetainMaterializationRequest,
} from '../../ports/MaterializationStorePort.ts';
import { adaptGitCasRetentionWitness } from './GitCasRetentionWitnessAdapter.ts';
import {
  decodeMaterializationDescriptor,
  MATERIALIZATION_DESCRIPTOR_SCHEMA_VERSION,
  materializationCoordinateData,
  materializationDescriptorData,
  materializationRootsFromDescriptor,
  type DecodedMaterializationDescriptor,
} from './GitCasMaterializationDescriptor.ts';

const CACHE_NAMESPACE = 'git-warp/materializations';
const DESCRIPTOR_PATH = 'meta/descriptor';
const MAX_DESCRIPTOR_BYTES = 1024 * 1024;
// A root-list change also requires a descriptor schema-version change.
const MATERIALIZATION_MEMBER_COUNT = MATERIALIZATION_ROOT_NAMES.length + 1;

type MaterializationCacheSet = Pick<CacheSet, 'get' | 'put'>;

export type GitCasMaterializationFacade = {
  readonly bundles: Pick<BundleCapability, 'iterateMembers' | 'putOrdered'>;
  readonly caches: {
    open(options: { readonly namespace: string }): Promise<MaterializationCacheSet>;
  };
  readonly pages: Pick<PageCapability, 'get' | 'put'>;
};

type DecodedMaterializationMembers = Readonly<{
  descriptor: PageHandle;
  retainedRoots: ReadonlyMap<MaterializationRootName, BundleHandle>;
}>;

type MaterializationMemberAccumulator = {
  descriptor: PageHandle | null;
  memberCount: number;
  roots: Map<MaterializationRootName, BundleHandle>;
};

/** git-cas-backed retained materialization lifecycle. */
export default class GitCasMaterializationStoreAdapter extends MaterializationStorePort {
  readonly #cas: GitCasMaterializationFacade;
  readonly #codec: CodecPort;
  readonly #crypto: CryptoPort;
  readonly #laneName: string;

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

  override async retain(request: RetainMaterializationRequest): Promise<MaterializationHandle> {
    requireRetainRequest(request);
    const stateHash = requireNonEmpty(request.stateHash, 'stateHash');
    const bundle = await this.#writeBundle(request, stateHash);
    const retention = await this.#retainBundle(bundle, request.coordinate);
    return new MaterializationHandle({
      laneName: this.#laneName,
      bundle: new BundleHandle(bundle.handle.toString()),
      coordinate: request.coordinate,
      roots: request.roots,
      stateHash,
      retention,
    });
  }

  async #writeBundle(
    request: RetainMaterializationRequest,
    stateHash: string,
  ): Promise<StagedBundle> {
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
    const bundle = await this.#cas.bundles.putOrdered({
      members: materializationMembers(descriptorPage.handle.toString(), request.roots),
    });
    return bundle;
  }

  async #retainBundle(
    bundle: StagedBundle,
    coordinate: MaterializationCoordinate,
  ): Promise<StorageRetentionWitness> {
    const cache = await this.#cas.caches.open({ namespace: CACHE_NAMESPACE });
    const cacheKey = await this.#cacheKey(coordinate);
    const stored = await cache.put(cacheKey, bundle.handle, { retention: 'evictable' });
    if (!stored.accepted || stored.hit === null || stored.witness === null) {
      throw storageError('git-cas did not retain the materialization bundle');
    }
    if (stored.hit.handle.toString() !== bundle.handle.toString()) {
      throw storageError('git-cas retained an unexpected materialization handle');
    }
    return adaptGitCasRetentionWitness(stored.witness.toJSON());
  }

  override async findExact(
    coordinate: MaterializationCoordinate,
  ): Promise<MaterializationHandle | null> {
    requireCoordinate(coordinate);
    const cache = await this.#cas.caches.open({ namespace: CACHE_NAMESPACE });
    const hit = await cache.get(await this.#cacheKey(coordinate));
    if (hit === null) {
      return null;
    }
    if (hit.handle.kind !== 'bundle') {
      throw storageError('cache entry does not reference a materialization bundle');
    }
    return await this.#resolveHit(hit, coordinate);
  }

  async #resolveHit(
    hit: CacheHit,
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
      retention: adaptGitCasRetentionWitness(hit.evidence.toJSON()),
    });
  }

  async #cacheKey(coordinate: MaterializationCoordinate): Promise<string> {
    const encoded = this.#codec.encode({
      schemaVersion: MATERIALIZATION_DESCRIPTOR_SCHEMA_VERSION,
      laneName: this.#laneName,
      coordinate: materializationCoordinateData(coordinate),
    });
    const digest = requireNonEmpty(
      await this.#crypto.hash('sha256', encoded),
      'coordinate digest',
    );
    return `v${MATERIALIZATION_DESCRIPTOR_SCHEMA_VERSION}:${digest}`;
  }

  async #readDescriptor(handle: PageHandle): Promise<DecodedMaterializationDescriptor> {
    const bytes = await this.#cas.pages.get({
      handle,
      maxBytes: MAX_DESCRIPTOR_BYTES,
    });
    return decodeMaterializationDescriptor(this.#codec.decode(bytes));
  }

  async #readMembers(bundle: BundleHandle): Promise<DecodedMaterializationMembers> {
    const accumulator = createMemberAccumulator();
    for await (const member of this.#cas.bundles.iterateMembers({
      handle: bundle.toString(),
    })) {
      collectMaterializationMember(accumulator, member);
    }
    return finishMaterializationMembers(accumulator);
  }
}

function* materializationMembers(
  descriptorHandle: string,
  roots: MaterializationRoots,
): Generator<[string, BundleMemberInput]> {
  yield [DESCRIPTOR_PATH, descriptorHandle];
  for (const [name, root] of roots.entries()) {
    if (root.status === 'retained') {
      yield [`roots/${name}`, requireRetainedHandle(root, name).toString()];
    }
  }
}

function createMemberAccumulator(): MaterializationMemberAccumulator {
  return {
    descriptor: null,
    memberCount: 0,
    roots: new Map<MaterializationRootName, BundleHandle>(),
  };
}

function collectMaterializationMember(
  accumulator: MaterializationMemberAccumulator,
  member: BundleMember,
): void {
  accumulator.memberCount += 1;
  if (accumulator.memberCount > MATERIALIZATION_MEMBER_COUNT) {
    throw storageError('materialization bundle has too many members');
  }
  if (member.path === DESCRIPTOR_PATH) {
    collectDescriptorMember(accumulator, member);
    return;
  }
  collectRootMember(accumulator, member);
}

function collectDescriptorMember(
  accumulator: MaterializationMemberAccumulator,
  member: BundleMember,
): void {
  if (accumulator.descriptor !== null) {
    throw storageError('materialization bundle has duplicate descriptor members');
  }
  if (member.handle.kind !== 'page') {
    throw storageError('materialization bundle has no descriptor page');
  }
  accumulator.descriptor = member.handle;
}

function collectRootMember(
  accumulator: MaterializationMemberAccumulator,
  member: BundleMember,
): void {
  const rootName = parseRootName(member.path);
  if (rootName === null) {
    throw storageError(`materialization bundle has an unexpected member: ${member.path}`);
  }
  if (accumulator.roots.has(rootName)) {
    throw storageError(`materialization bundle has duplicate ${rootName} root members`);
  }
  if (member.handle.kind !== 'bundle') {
    throw storageError(`materialization bundle has no ${rootName} root bundle`);
  }
  accumulator.roots.set(rootName, new BundleHandle(member.handle.toString()));
}

function finishMaterializationMembers(
  accumulator: MaterializationMemberAccumulator,
): DecodedMaterializationMembers {
  if (accumulator.descriptor === null) {
    throw storageError('materialization bundle has no descriptor page');
  }
  return Object.freeze({
    descriptor: accumulator.descriptor,
    retainedRoots: new Map(accumulator.roots),
  });
}

function requireRetainedHandle(
  root: MaterializationRoot,
  name: MaterializationRootName,
): BundleHandle {
  if (root.handle === null) {
    throw storageError(`${name} retained root has no bundle handle`);
  }
  return root.handle;
}

function parseRootName(path: string): MaterializationRootName | null {
  const prefix = 'roots/';
  if (!path.startsWith(prefix)) {
    return null;
  }
  const candidate = path.slice(prefix.length);
  return MATERIALIZATION_ROOT_NAMES.find((name) => name === candidate) ?? null;
}

function requireRetainRequest(request: RetainMaterializationRequest): void {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    throw storageError('retain request must be an object');
  }
  requireCoordinate(request.coordinate);
  if (!(request.roots instanceof MaterializationRoots)) {
    throw storageError('retain request roots have an invalid runtime identity');
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
