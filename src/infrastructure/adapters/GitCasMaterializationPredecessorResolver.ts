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
import {
  MATERIALIZATION_DESCRIPTOR_SCHEMA_VERSION,
  type DecodedMaterializationDescriptor,
} from './GitCasMaterializationDescriptor.ts';
import { storageError } from './GitCasMaterializationStoreValidation.ts';

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

  constructor(options: {
    readonly openCache: () => Promise<InspectionCache>;
    readonly laneName: string;
    readonly readDescriptor: (
      bundle: BundleHandle,
    ) => Promise<DecodedMaterializationDescriptor>;
    readonly cacheKey: (coordinate: MaterializationCoordinate) => Promise<string>;
  }) {
    this.#openCache = options.openCache;
    this.#laneName = options.laneName;
    this.#readDescriptor = options.readDescriptor;
    this.#cacheKey = options.cacheKey;
  }

  async find(
    target: MaterializationCoordinate,
    isCompatible: MaterializationPredecessorPredicate,
  ): Promise<MaterializationCoordinate | null> {
    const cache = await this.#openCache();
    let best: MaterializationCandidate | null = null;
    for await (const entry of inspectEntries(cache)) {
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
    if (!entry.key.startsWith(currentSchemaPrefix())) {
      return null;
    }
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

async function* inspectEntries(
  cache: InspectionCache,
): AsyncGenerator<CacheEntryMetadata> {
  let cursor: string | null = null;
  let inspected = 0;
  do {
    const page: CacheInspection = await cache.inspect({
      limit: MAX_CACHE_INSPECTION_PAGE,
      cursor,
    });
    for (const entry of page.entries) {
      inspected += 1;
      if (inspected > MAX_MATERIALIZATION_CANDIDATES) {
        throw storageError('materialization cache exceeds predecessor scan limit');
      }
      yield entry;
    }
    cursor = page.nextCursor;
  } while (cursor !== null);
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

function currentSchemaPrefix(): string {
  return `v${String(MATERIALIZATION_DESCRIPTOR_SCHEMA_VERSION)}:`;
}
