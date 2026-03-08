import { describe, it, expect, vi, beforeEach } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { buildSeekCacheKey } from '../../../src/domain/utils/seekCacheKey.js';
import { encode } from '../../../src/infrastructure/codecs/CborCodec.js';
import { encodePatchMessage } from '../../../src/domain/services/WarpMessageCodec.js';
import { createMockPersistence } from '../../helpers/warpGraphTestUtils.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @param {string} writer @param {number} lamport @param {string} nodeId */
function createPatch(writer, lamport, nodeId) {
  return {
    schema: 2,
    writer,
    lamport,
    context: { [writer]: lamport },
    ops: [{ type: 'NodeAdd', node: nodeId, dot: { writerId: writer, counter: lamport } }],
  };
}

/** @param {string} label */
function fakeSha(label) {
  const hex = Buffer.from(String(label)).toString('hex');
  return hex.padEnd(40, 'a').slice(0, 40);
}

/** @param {any} persistence @param {any} writerSpecs @param {string} [graphName] */
function setupPersistence(persistence, writerSpecs, graphName = 'test') {
  const nodeInfoMap = new Map();
  const blobMap = new Map();
  /** @type {Record<string, string>} */
  const writerTips = {};

  for (const [writer, count] of Object.entries(writerSpecs)) {
    const shas = [];
    for (let i = 1; i <= count; i++) {
      shas.push(fakeSha(`${writer}${i}`));
    }
    writerTips[writer] = shas[0];

    for (let j = 0; j < count; j++) {
      const lamport = count - j;
      const patchOid = fakeSha(`blob-${writer}-${lamport}`);
      const message = encodePatchMessage({
        graph: graphName,
        writer,
        lamport,
        patchOid,
        schema: 2,
      });
      const parents = j < count - 1 ? [shas[j + 1]] : [];
      nodeInfoMap.set(shas[j], { message, parents });
      const patch = createPatch(writer, lamport, `n:${writer}:${lamport}`);
      blobMap.set(patchOid, encode(patch));
    }
  }

  const writerRefs = Object.keys(writerSpecs).map(
    (w) => `refs/warp/${graphName}/writers/${w}`
  );

  persistence.getNodeInfo.mockImplementation((/** @type {any} */ sha) => {
    const info = nodeInfoMap.get(sha);
    if (info) {
      return Promise.resolve(info);
    }
    return Promise.resolve({ message: '', parents: [] });
  });

  persistence.readBlob.mockImplementation((/** @type {any} */ oid) => {
    const buf = blobMap.get(oid);
    if (buf) {
      return Promise.resolve(buf);
    }
    return Promise.resolve(Buffer.alloc(0));
  });

  persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
    if (ref === `refs/warp/${graphName}/checkpoints/head`) {
      return Promise.resolve(null);
    }
    for (const [writer, tip] of Object.entries(writerTips)) {
      if (ref === `refs/warp/${graphName}/writers/${writer}`) {
        return Promise.resolve(tip);
      }
    }
    return Promise.resolve(null);
  });

  persistence.listRefs.mockImplementation((/** @type {any} */ prefix) => {
    if (prefix.startsWith(`refs/warp/${graphName}/writers`)) {
      return Promise.resolve(writerRefs);
    }
    return Promise.resolve([]);
  });

  return writerTips;
}

/**
 * Creates an in-memory SeekCachePort mock.
 *
 * Stores entries as `{ buffer, indexTreeOid? }` objects matching the
 * updated SeekCachePort contract.
 */
function createMockSeekCache() {
  /** @type {Map<string, { buffer: Buffer, indexTreeOid?: string }>} */
  const store = new Map();
  return {
    get: vi.fn(async (/** @type {string} */ key) => store.get(key) ?? null),
    set: vi.fn(async (/** @type {string} */ key, /** @type {Buffer} */ buf, /** @type {{ indexTreeOid?: string }} */ opts) => {
      /** @type {{ buffer: Buffer, indexTreeOid?: string }} */
      const entry = { buffer: buf };
      if (opts?.indexTreeOid) {
        entry.indexTreeOid = opts.indexTreeOid;
      }
      store.set(key, entry);
    }),
    has: vi.fn(async (/** @type {string} */ key) => store.has(key)),
    keys: vi.fn(async () => [...store.keys()]),
    delete: vi.fn(async (/** @type {string} */ key) => store.delete(key)),
    clear: vi.fn(async () => { store.clear(); }),
    _store: store,
  };
}

// ===========================================================================
// seekCacheKey utility
// ===========================================================================

describe('buildSeekCacheKey', () => {
  it('produces deterministic keys for identical inputs', async () => {
    const frontier = new Map([['alice', 'aaa'], ['bob', 'bbb']]);
    const k1 = await buildSeekCacheKey(5, frontier);
    const k2 = await buildSeekCacheKey(5, frontier);
    expect(k1).toBe(k2);
  });

  it('starts with version prefix', async () => {
    const key = await buildSeekCacheKey(10, new Map([['w1', 'sha1']]));
    expect(key).toMatch(/^v1:t10-/);
  });

  it('uses full 64-char SHA-256 hex digest', async () => {
    const key = await buildSeekCacheKey(1, new Map([['w', 's']]));
    // v1:t1-<64 hex chars>
    const hash = key.split('-').slice(1).join('-');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs when ceiling changes', async () => {
    const f = new Map([['w', 'sha']]);
    expect(await buildSeekCacheKey(1, f)).not.toBe(await buildSeekCacheKey(2, f));
  });

  it('differs when frontier changes', async () => {
    const f1 = new Map([['w', 'sha1']]);
    const f2 = new Map([['w', 'sha2']]);
    expect(await buildSeekCacheKey(1, f1)).not.toBe(await buildSeekCacheKey(1, f2));
  });

  it('is order-independent for frontier entries', async () => {
    const f1 = new Map([['alice', 'a'], ['bob', 'b']]);
    const f2 = new Map([['bob', 'b'], ['alice', 'a']]);
    expect(await buildSeekCacheKey(1, f1)).toBe(await buildSeekCacheKey(1, f2));
  });
});

/** Flush microtask queue so fire-and-forget promises settle. */
const flush = () => new Promise((r) => { setTimeout(r, 0); });

// ===========================================================================
// WarpGraph seek cache integration (mock cache)
// ===========================================================================

describe('WarpGraph seek cache integration', () => {
  /** @type {any} */
  let persistence;
  /** @type {any} */
  let seekCache;

  beforeEach(() => {
    persistence = createMockPersistence();
    // Ensure writeBlob/writeTree resolve for index tree persistence
    persistence.writeBlob.mockResolvedValue('mock-blob-oid');
    persistence.writeTree.mockResolvedValue('mock-tree-oid');
    seekCache = createMockSeekCache();
  });

  it('stores state to cache on first ceiling materialize', async () => {
    setupPersistence(persistence, { w1: 3 });
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      seekCache,
    });

    await graph.materialize({ ceiling: 2 });
    await flush();

    expect(seekCache.set).toHaveBeenCalledTimes(1);
    const [key, buf] = seekCache.set.mock.calls[0];
    expect(key).toMatch(/^v1:t2-/);
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('restores state from cache on second visit to same tick', async () => {
    setupPersistence(persistence, { w1: 3 });
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      seekCache,
    });

    // First visit — full materialize, stores to cache
    await graph.materialize({ ceiling: 2 });
    await flush();
    const getCallsBefore = seekCache.get.mock.calls.length;

    // Clear in-memory cache to force persistent cache path
    graph._cachedState = null;
    graph._cachedCeiling = null;
    graph._cachedFrontier = null;

    // Second visit — should hit persistent cache
    await graph.materialize({ ceiling: 2 });

    // get() called at least once more
    expect(seekCache.get.mock.calls.length).toBeGreaterThan(getCallsBefore);
    // No additional set() call (already cached)
    expect(seekCache.set).toHaveBeenCalledTimes(1);
  });

  it('skips cache when collectReceipts is true', async () => {
    setupPersistence(persistence, { w1: 3 });
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      seekCache,
    });

    await graph.materialize({ ceiling: 2, receipts: true });

    expect(seekCache.get).not.toHaveBeenCalled();
    expect(seekCache.set).not.toHaveBeenCalled();
  });

  it('does not store when no patches match ceiling', async () => {
    setupPersistence(persistence, { w1: 3 });
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      seekCache,
    });

    await graph.materialize({ ceiling: 0 });

    expect(seekCache.set).not.toHaveBeenCalled();
  });

  it('sets _provenanceDegraded on cache hit', async () => {
    setupPersistence(persistence, { w1: 3 });
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      seekCache,
    });

    // First materialize — populates cache
    await graph.materialize({ ceiling: 2 });
    await flush();
    expect(graph._provenanceDegraded).toBe(false);

    // Force persistent cache path
    graph._cachedState = null;
    graph._cachedCeiling = null;
    graph._cachedFrontier = null;

    // Second materialize — hits cache
    await graph.materialize({ ceiling: 2 });
    expect(graph._provenanceDegraded).toBe(true);
  });

  it('throws E_PROVENANCE_DEGRADED on patchesFor after cache hit', async () => {
    setupPersistence(persistence, { w1: 3 });
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      seekCache,
    });

    await graph.materialize({ ceiling: 2 });
    await flush();

    // Force cache hit
    graph._cachedState = null;
    graph._cachedCeiling = null;
    graph._cachedFrontier = null;
    await graph.materialize({ ceiling: 2 });

    await expect(graph.patchesFor('n:w1:1')).rejects.toThrow(/Provenance unavailable/);
  });

  it('clears _provenanceDegraded on full materialize', async () => {
    setupPersistence(persistence, { w1: 3 });
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      seekCache,
    });

    await graph.materialize({ ceiling: 2 });
    await flush();
    graph._cachedState = null;
    graph._cachedCeiling = null;
    graph._cachedFrontier = null;
    await graph.materialize({ ceiling: 2 });
    expect(graph._provenanceDegraded).toBe(true);

    // Full materialize without ceiling clears degraded flag
    await graph.materialize();
    expect(graph._provenanceDegraded).toBe(false);
  });

  it('gracefully handles cache get() failure', async () => {
    setupPersistence(persistence, { w1: 3 });
    seekCache.get.mockRejectedValue(new Error('storage error'));
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      seekCache,
    });

    // Should not throw — falls through to full materialize
    const state = /** @type {any} */ (await graph.materialize({ ceiling: 2 }));
    expect(state).toBeDefined();
    expect(state.nodeAlive).toBeDefined();
  });

  it('gracefully handles cache set() failure', async () => {
    setupPersistence(persistence, { w1: 3 });
    seekCache.set.mockRejectedValue(new Error('storage error'));
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      seekCache,
    });

    // Should not throw — cache write failure is non-fatal
    const state = await graph.materialize({ ceiling: 2 });
    expect(state).toBeDefined();
  });

  it('works without seekCache (null)', async () => {
    setupPersistence(persistence, { w1: 3 });
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
    });

    const state = await graph.materialize({ ceiling: 2 });
    expect(state).toBeDefined();
    expect(graph._seekCache).toBeNull();
  });

  it('setSeekCache(null) detaches the cache', async () => {
    setupPersistence(persistence, { w1: 3 });
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      seekCache,
    });

    expect(graph.seekCache).toBe(seekCache);
    graph.setSeekCache(/** @type {any} */ (null));
    expect(graph.seekCache).toBeNull();

    // Materialize should still work without cache
    const state = await graph.materialize({ ceiling: 2 });
    expect(state).toBeDefined();
    expect(seekCache.get).not.toHaveBeenCalled();
    expect(seekCache.set).not.toHaveBeenCalled();
  });

  it('deletes corrupted cache entry on deserialize failure', async () => {
    setupPersistence(persistence, { w1: 3 });
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      seekCache,
    });

    // First materialize populates cache
    await graph.materialize({ ceiling: 2 });
    await flush();
    expect(seekCache.set).toHaveBeenCalledTimes(1);
    const [cacheKey] = seekCache.set.mock.calls[0];

    // Corrupt the cached data (store object with bad buffer)
    seekCache._store.set(cacheKey, { buffer: Buffer.from('corrupted-data') });

    // Clear in-memory cache
    graph._cachedState = null;
    graph._cachedCeiling = null;
    graph._cachedFrontier = null;

    // Second materialize should self-heal: delete bad entry and re-materialize
    const state = /** @type {any} */ (await graph.materialize({ ceiling: 2 }));
    expect(state).toBeDefined();
    expect(state.nodeAlive).toBeDefined();
    expect(seekCache.delete).toHaveBeenCalledWith(cacheKey);
  });
});
