import type {
  BundleCapability,
  BundleMemberInput,
  CacheHit,
  CacheSet,
  PageCapability,
  StagedBundle,
} from '@git-stunts/git-cas';
import MaterializationCoordinate from '../../domain/materialization/MaterializationCoordinate.ts';
import MaterializationHandle from '../../domain/materialization/MaterializationHandle.ts';
import MaterializationRoots, {
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

const CACHE_NAMESPACE = 'git-warp/materializations';
const DESCRIPTOR_PATH = 'meta/descriptor';
const MAX_DESCRIPTOR_BYTES = 1024 * 1024;
const SCHEMA_VERSION = 1;

type MaterializationCacheSet = Pick<CacheSet, 'get' | 'put'>;

export type GitCasMaterializationFacade = {
  readonly bundles: Pick<BundleCapability, 'getMember' | 'putOrdered'>;
  readonly caches: {
    open(options: { readonly namespace: string }): Promise<MaterializationCacheSet>;
  };
  readonly pages: Pick<PageCapability, 'get' | 'put'>;
};

type DecodedDescriptor = Readonly<{
  coordinate: MaterializationCoordinate;
  stateHash: string;
  laneName: string;
}>;

type MaterializationRootHandles = readonly [
  BundleHandle,
  BundleHandle,
  BundleHandle,
  BundleHandle,
  BundleHandle,
  BundleHandle,
  BundleHandle,
  BundleHandle,
];

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
    const descriptorBytes = this.#codec.encode(descriptorData({
      coordinate: request.coordinate,
      stateHash,
      laneName: this.#laneName,
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
    const descriptor = await this.#readDescriptor(bundle);
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
      roots: await this.#readRoots(bundle),
      stateHash: descriptor.stateHash,
      retention: adaptGitCasRetentionWitness(hit.evidence.toJSON()),
    });
  }

  async #cacheKey(coordinate: MaterializationCoordinate): Promise<string> {
    const encoded = this.#codec.encode({
      schemaVersion: SCHEMA_VERSION,
      laneName: this.#laneName,
      coordinate: coordinateData(coordinate),
    });
    const digest = requireNonEmpty(
      await this.#crypto.hash('sha256', encoded),
      'coordinate digest',
    );
    return `v${SCHEMA_VERSION}:${digest}`;
  }

  async #readDescriptor(bundle: BundleHandle): Promise<DecodedDescriptor> {
    const member = await this.#cas.bundles.getMember({
      handle: bundle.toString(),
      path: DESCRIPTOR_PATH,
    });
    if (member === null || member.handle.kind !== 'page') {
      throw storageError('materialization bundle has no descriptor page');
    }
    const bytes = await this.#cas.pages.get({
      handle: member.handle,
      maxBytes: MAX_DESCRIPTOR_BYTES,
    });
    return decodeDescriptor(this.#codec.decode(bytes));
  }

  async #readRoots(bundle: BundleHandle): Promise<MaterializationRoots> {
    const handles = await Promise.all([
      this.#readRoot(bundle, 'adjacency'),
      this.#readRoot(bundle, 'edge-alive'),
      this.#readRoot(bundle, 'edge-births'),
      this.#readRoot(bundle, 'frontier'),
      this.#readRoot(bundle, 'node-alive'),
      this.#readRoot(bundle, 'properties'),
      this.#readRoot(bundle, 'provenance-support'),
      this.#readRoot(bundle, 'roaring-indexes'),
    ]);
    return rootsFromHandles(handles);
  }

  async #readRoot(
    bundle: BundleHandle,
    rootName: MaterializationRootName,
  ): Promise<BundleHandle> {
    const member = await this.#cas.bundles.getMember({
      handle: bundle.toString(),
      path: `roots/${rootName}`,
    });
    if (member === null || member.handle.kind !== 'bundle') {
      throw storageError(`materialization bundle has no ${rootName} root bundle`);
    }
    return new BundleHandle(member.handle.toString());
  }
}

function descriptorData(descriptor: DecodedDescriptor): object {
  return {
    schemaVersion: SCHEMA_VERSION,
    laneName: descriptor.laneName,
    stateHash: descriptor.stateHash,
    coordinate: coordinateData(descriptor.coordinate),
  };
}

function coordinateData(coordinate: MaterializationCoordinate): object {
  return {
    ceiling: coordinate.ceiling,
    frontier: coordinate.frontierEntries.map((entry) => [entry.writerId, entry.patchSha]),
  };
}

function* materializationMembers(
  descriptorHandle: string,
  roots: MaterializationRoots,
): Generator<[string, BundleMemberInput]> {
  yield [DESCRIPTOR_PATH, descriptorHandle];
  for (const [name, handle] of roots.entries()) {
    yield [`roots/${name}`, handle.toString()];
  }
}

function decodeDescriptor(value: unknown): DecodedDescriptor {
  requireRecord(value, 'descriptor');
  const descriptor = value;
  if (descriptor['schemaVersion'] !== SCHEMA_VERSION) {
    throw storageError('materialization descriptor schema is unsupported');
  }
  const coordinateValue = descriptor['coordinate'];
  requireRecord(coordinateValue, 'descriptor.coordinate');
  const frontier = decodeFrontier(coordinateValue['frontier']);
  return Object.freeze({
    laneName: requireNonEmpty(descriptor['laneName'], 'descriptor.laneName'),
    stateHash: requireNonEmpty(descriptor['stateHash'], 'descriptor.stateHash'),
    coordinate: new MaterializationCoordinate({
      frontier,
      ceiling: requireCeiling(coordinateValue['ceiling']),
    }),
  });
}

function decodeFrontier(value: unknown): Map<string, string> {
  if (!Array.isArray(value)) {
    throw storageError('descriptor.coordinate.frontier must be an array');
  }
  const frontier = new Map<string, string>();
  for (const entry of value) {
    const [writerId, patchSha] = decodeFrontierEntry(entry);
    if (frontier.has(writerId)) {
      throw storageError('descriptor coordinate contains a duplicate frontier writer');
    }
    frontier.set(writerId, patchSha);
  }
  return frontier;
}

function decodeFrontierEntry(value: unknown): readonly [string, string] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw storageError('descriptor coordinate contains an invalid frontier entry');
  }
  return Object.freeze([
    requireNonEmpty(value[0], 'descriptor frontier writerId'),
    requireNonEmpty(value[1], 'descriptor frontier patchSha'),
  ]);
}

function rootsFromHandles(handles: MaterializationRootHandles): MaterializationRoots {
  return new MaterializationRoots({
    adjacency: handles[0],
    edgeAlive: handles[1],
    edgeBirths: handles[2],
    frontier: handles[3],
    nodeAlive: handles[4],
    properties: handles[5],
    provenanceSupport: handles[6],
    roaringIndexes: handles[7],
  });
}

function requireCeiling(value: unknown): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw storageError('descriptor coordinate ceiling is invalid');
  }
  return value;
}

function requireRecord(
  value: unknown,
  field: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw storageError(`${field} must be an object`);
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
