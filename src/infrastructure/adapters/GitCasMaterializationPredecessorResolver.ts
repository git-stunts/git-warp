import type {
  CacheEntryMetadata,
  CacheInspection,
  CacheSet,
} from '@git-stunts/git-cas';
import type MaterializationCoordinate from '../../domain/materialization/MaterializationCoordinate.ts';
import BundleHandle from '../../domain/storage/BundleHandle.ts';
import type {
  MaterializationPredecessorPredicate,
} from '../../ports/MaterializationStorePort.ts';
import type {
  DecodedMaterializationDescriptor,
} from './GitCasMaterializationDescriptor.ts';

const MAX_CACHE_INSPECTION_PAGE = 100;
const MAX_MATERIALIZATION_CANDIDATES = 1024;

type MaterializationCandidate = Readonly<{
  coordinate: MaterializationCoordinate;
  createdAt: string;
  key: string;
}>;

type InspectionCache = Pick<CacheSet, 'inspect'>;

/** Finds the newest bounded, validated retained predecessor in the git-cas cache. */
export default class GitCasMaterializationPredecessorResolver {
  readonly #openCache: () => Promise<InspectionCache>;
  readonly #laneName: string;
  readonly #readDescriptor: (
    bundle: BundleHandle,
  ) => Promise<DecodedMaterializationDescriptor>;
  readonly #cacheKey: (coordinate: MaterializationCoordinate) => Promise<string>;
  readonly #cacheKeyPrefix: () => Promise<string>;

  constructor(options: {
    readonly openCache: () => Promise<InspectionCache>;
    readonly laneName: string;
    readonly readDescriptor: (
      bundle: BundleHandle,
    ) => Promise<DecodedMaterializationDescriptor>;
    readonly cacheKey: (coordinate: MaterializationCoordinate) => Promise<string>;
    readonly cacheKeyPrefix: () => Promise<string>;
  }) {
    this.#openCache = options.openCache;
    this.#laneName = options.laneName;
    this.#readDescriptor = options.readDescriptor;
    this.#cacheKey = options.cacheKey;
    this.#cacheKeyPrefix = options.cacheKeyPrefix;
  }

  async find(
    target: MaterializationCoordinate,
    isCompatible: MaterializationPredecessorPredicate,
  ): Promise<MaterializationCoordinate | null> {
    const cache = await this.#openCache();
    const entries = await inspectEntries(cache, await this.#cacheKeyPrefix());
    if (entries === null) {
      return null;
    }
    let best: MaterializationCandidate | null = null;
    for (const entry of entries) {
      const candidate = await this.#candidateFromEntry(entry, target, isCompatible);
      best = selectBetterCandidate(candidate, best);
    }
    return best?.coordinate ?? null;
  }

  async #candidateFromEntry(
    entry: CacheEntryMetadata,
    target: MaterializationCoordinate,
    isCompatible: MaterializationPredecessorPredicate,
  ): Promise<MaterializationCandidate | null> {
    const descriptor = await this.#readDescriptor(new BundleHandle(entry.handle));
    if (!descriptorCanResume(descriptor, target, this.#laneName)) {
      return null;
    }
    if (entry.key !== await this.#cacheKey(descriptor.coordinate)) {
      return null;
    }
    if (!await isCompatible(descriptor.coordinate)) {
      return null;
    }
    return Object.freeze({
      coordinate: descriptor.coordinate,
      createdAt: entry.createdAt,
      key: entry.key,
    });
  }
}

async function inspectEntries(
  cache: InspectionCache,
  cacheKeyPrefix: string,
): Promise<readonly CacheEntryMetadata[] | null> {
  const entries: CacheEntryMetadata[] = [];
  let cursor: string | null = null;
  do {
    const page: CacheInspection = await cache.inspect({
      limit: MAX_CACHE_INSPECTION_PAGE,
      cursor,
    });
    for (const entry of page.entries) {
      if (!entry.key.startsWith(cacheKeyPrefix)) {
        continue;
      }
      if (entries.length === MAX_MATERIALIZATION_CANDIDATES) {
        return null;
      }
      entries.push(entry);
    }
    cursor = page.nextCursor;
  } while (cursor !== null);
  return Object.freeze(entries);
}

function descriptorCanResume(
  descriptor: DecodedMaterializationDescriptor,
  target: MaterializationCoordinate,
  laneName: string,
): boolean {
  return descriptor.laneName === laneName
    && !descriptor.coordinate.equals(target)
    && descriptor.rootStatuses.get('replay-basis') === 'retained';
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

function selectBetterCandidate(
  candidate: MaterializationCandidate | null,
  current: MaterializationCandidate | null,
): MaterializationCandidate | null {
  if (candidate === null) {
    return current;
  }
  return candidateIsBetter(candidate, current) ? candidate : current;
}
