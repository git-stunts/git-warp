import type {
  CacheEntryMetadata,
  CacheInspection,
  CacheSet,
} from '@git-stunts/git-cas';
import { describe, expect, it, vi } from 'vitest';
import MaterializationCoordinate from '../../../../src/domain/materialization/MaterializationCoordinate.ts';
import type {
  MaterializationRootName,
} from '../../../../src/domain/materialization/MaterializationRoots.ts';
import type {
  MaterializationRootStatus,
} from '../../../../src/domain/materialization/MaterializationRoot.ts';
import GitCasMaterializationPredecessorResolver from '../../../../src/infrastructure/adapters/GitCasMaterializationPredecessorResolver.ts';
import type {
  DecodedMaterializationDescriptor,
} from '../../../../src/infrastructure/adapters/GitCasMaterializationDescriptor.ts';

const LANE_PREFIX = 'v4:lane-digest:';
const TARGET = coordinate('b'.repeat(40));
const PREDECESSOR = coordinate('a'.repeat(40));

describe('GitCasMaterializationPredecessorResolver', () => {
  it('excludes other lanes before descriptor reads and budget accounting', async () => {
    const unrelated = Array.from(
      { length: 1_500 },
      (_, index) => cacheEntry(`v4:other-lane:${String(index)}`, `other:${String(index)}`),
    );
    const matching = cacheEntry(`${LANE_PREFIX}predecessor`, 'matching');
    const readDescriptor = vi.fn().mockResolvedValue(descriptor(PREDECESSOR));
    const resolver = resolverFor([...unrelated, matching], readDescriptor);

    await expect(resolver.find(TARGET, () => Promise.resolve(true))).resolves.toEqual(
      PREDECESSOR,
    );

    expect(readDescriptor).toHaveBeenCalledOnce();
  });

  it('returns no predecessor when the lane-local candidate budget is exhausted', async () => {
    const entries = Array.from(
      { length: 1_025 },
      (_, index) => cacheEntry(`${LANE_PREFIX}${String(index)}`, `matching:${String(index)}`),
    );
    const readDescriptor = vi.fn().mockResolvedValue(descriptor(PREDECESSOR));
    const resolver = resolverFor(entries, readDescriptor);

    await expect(resolver.find(TARGET, () => Promise.resolve(true))).resolves.toBeNull();

    expect(readDescriptor).not.toHaveBeenCalled();
  });
});

function resolverFor(
  entries: readonly CacheEntryMetadata[],
  readDescriptor: (handle: object) => Promise<DecodedMaterializationDescriptor>,
): GitCasMaterializationPredecessorResolver {
  const cache = {
    inspect: async (options: { readonly limit: number; readonly cursor?: string | null }) => {
      const start = Number(options.cursor ?? '0');
      const page = entries.slice(start, start + options.limit);
      const next = start + page.length;
      return inspection(page, next < entries.length ? String(next) : null);
    },
  } satisfies Pick<CacheSet, 'inspect'>;
  return new GitCasMaterializationPredecessorResolver({
    openCache: () => Promise.resolve(cache),
    laneName: 'events',
    readDescriptor,
    cacheKey: () => Promise.resolve(`${LANE_PREFIX}predecessor`),
    cacheKeyPrefix: () => Promise.resolve(LANE_PREFIX),
  });
}

function cacheEntry(key: string, handle: string): CacheEntryMetadata {
  return Object.freeze({
    version: 1,
    accountingVersion: 1,
    key,
    keyDigest: `digest:${key}`,
    handle,
    policy: 'evictable',
    expiresAt: null,
    logicalBytes: 1,
    createdAt: '2026-07-24T00:00:00.000Z',
    accessedAt: '2026-07-24T00:00:00.000Z',
  });
}

function inspection(
  entries: readonly CacheEntryMetadata[],
  nextCursor: string | null,
): CacheInspection {
  return Object.freeze({
    namespace: 'git-warp/materializations',
    ref: 'refs/cas/cache/test',
    generation: 'generation-1',
    state: null,
    observed: null,
    policy: null,
    entries,
    nextCursor,
  });
}

function descriptor(
  materializationCoordinate: MaterializationCoordinate,
): DecodedMaterializationDescriptor {
  const rootStatuses = new Map<MaterializationRootName, MaterializationRootStatus>([
    ['replay-basis', 'retained'],
  ]);
  return Object.freeze({
    coordinate: materializationCoordinate,
    stateHash: 'state-hash',
    laneName: 'events',
    rootStatuses,
  });
}

function coordinate(tip: string): MaterializationCoordinate {
  return new MaterializationCoordinate({
    frontier: new Map([['writer-1', tip]]),
    ceiling: null,
  });
}
