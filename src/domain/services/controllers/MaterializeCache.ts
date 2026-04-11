/**
 * MaterializeCache — seek cache and index lifecycle for materialization.
 *
 * Encapsulates seek cache reads/writes and index tree restoration.
 * All operations are best-effort; failures are non-fatal.
 */

import { buildSeekCacheKey } from '../../utils/seekCacheKey.ts';
import { deserializeFullStateV5, serializeFullStateV5 } from '../state/CheckpointSerializerV5.js';
import { ProvenanceIndex } from '../provenance/ProvenanceIndex.js';
import type WarpState from '../state/WarpState.ts';
import type { WarpGraphWithMixins } from '../../warp/_internal.ts';

type CacheHost = WarpGraphWithMixins;

/** Result of a seek cache lookup. */
export type CacheLookupResult = {
  state: WarpState | null;
  cacheKey: string | null;
};

async function tryBuildCacheKey(ceiling: number, frontier: Map<string, string>): Promise<string | null> {
  try {
    return await buildSeekCacheKey(ceiling, frontier);
  } catch {
    return null;
  }
}

async function tryReadCachedState(host: CacheHost, cacheKey: string): Promise<{ state: WarpState; indexTreeOid: string | null } | null> {
  if (!host._seekCache) { return null; }
  const cached = await host._seekCache.get(cacheKey);
  if (!cached) { return null; }
  const state = deserializeFullStateV5(cached.buffer, { codec: host._codec });
  const indexTreeOid = typeof cached.indexTreeOid === 'string' && cached.indexTreeOid.length > 0
    ? cached.indexTreeOid
    : null;
  return { state, indexTreeOid };
}

function applyRestoredState(host: CacheHost, params: { state: WarpState; ceiling: number; frontier: Map<string, string> }): void {
  host._provenanceIndex = new ProvenanceIndex();
  host._provenanceDegraded = true;
  host._cachedCeiling = params.ceiling;
  host._cachedFrontier = new Map(params.frontier);
}

/**
 * Attempts to read a materialized state from the seek cache.
 * Returns { state, cacheKey } on hit, { state: null, cacheKey } on miss,
 * or null if caching is unavailable.
 */
export async function tryReadCoordinateCache(host: CacheHost, params: { frontier: Map<string, string>; ceiling: number | null; t0: number }): Promise<CacheLookupResult | null> {
  if (!host._seekCache || params.ceiling === null) {
    return null;
  }

  const cacheKey = await tryBuildCacheKey(params.ceiling, params.frontier);
  if (!cacheKey) { return null; }

  try {
    const cached = await tryReadCachedState(host, cacheKey);
    if (!cached) { return { state: null, cacheKey }; }
    applyRestoredState(host, { state: cached.state, ceiling: params.ceiling, frontier: params.frontier });
    await host._setMaterializedState(cached.state);
    if (cached.indexTreeOid) {
      await restoreIndexFromCache(host, cached.indexTreeOid);
    }
    host._logTiming('materialize', params.t0, { metrics: `cache hit (coordinate ceiling=${params.ceiling})` });
    return { state: cached.state, cacheKey };
  } catch {
    await tryDeleteCacheKey(host, cacheKey);
    return { state: null, cacheKey };
  }
}

async function tryDeleteCacheKey(host: CacheHost, cacheKey: string): Promise<void> {
  try {
    if (host._seekCache) { await host._seekCache.delete(cacheKey); }
  } catch { /* best-effort */ }
}

/**
 * Restores a LogicalIndex and PropertyReader from a cached index tree.
 * Failure is non-fatal.
 */
export async function restoreIndexFromCache(host: CacheHost, indexTreeOid: string): Promise<void> {
  try {
    const shardOids = await host._persistence.readTreeOids(indexTreeOid);
    const { logicalIndex, propertyReader } = await host._viewService.loadFromOids(shardOids, host._persistence);
    host._logicalIndex = logicalIndex;
    host._propertyReader = propertyReader;
  } catch {
    // Non-fatal — fall back to in-memory index
  }
}

/**
 * Persists a seek cache entry with optional index tree snapshot.
 * Failure is non-fatal.
 */
export async function persistSeekCacheEntry(host: CacheHost, params: { cacheKey: string; state: WarpState }): Promise<void> {
  const buf = serializeFullStateV5(params.state, { codec: host._codec });
  const indexTreeOid = await tryBuildIndexTree(host, params.state);
  if (host._seekCache) {
    await host._seekCache.set(params.cacheKey, buf, indexTreeOid ? { indexTreeOid } : {});
  }
}

async function tryBuildIndexTree(host: CacheHost, state: WarpState): Promise<string | null> {
  try {
    const { tree } = host._viewService.build(state);
    return await host._viewService.persistIndexTree(tree, host._persistence);
  } catch {
    return null;
  }
}
