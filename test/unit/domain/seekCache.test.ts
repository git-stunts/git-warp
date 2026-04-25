import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import { buildSeekCacheKey } from '../../../src/domain/utils/seekCacheKey.ts';
import { encode } from '../../../src/infrastructure/codecs/CborCodec.ts';
import { encodePatchMessage } from '../../../src/domain/services/codec/WarpMessageCodec.ts';
import { createMockPersistence } from '../../helpers/warpGraphTestUtils.ts';

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
    const writerTips = ({}) as Record<string, string>;

  for (const [writer, count] of Object.entries(writerSpecs)) {
    const shas: string[] = [];
    for (let i = 1; i <= (count as any); i++) {
      shas.push(fakeSha(`${writer}${i}`));
    }
    writerTips[writer] = shas[0] ?? '';

    for (let j = 0; j < (count as any); j++) {
      const lamport = (count as any) - j;
      const patchOid = fakeSha(`blob-${writer}-${lamport}`);
      const message = encodePatchMessage({
        graph: graphName,
        writer,
        lamport,
        patchOid,
        schema: 2,
      });
      const parents = j < (count as any) - 1 ? [shas[j + 1]] : [];
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
        (entry as any).indexTreeOid = opts.indexTreeOid;
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

// ===========================================================================
// WarpCore seek cache compatibility surface
// ===========================================================================

describe('WarpCore seek cache compatibility surface', () => {
  let persistence;
  let seekCache;

  beforeEach(() => {
    persistence = createMockPersistence();
    persistence.writeBlob.mockResolvedValue('mock-blob-oid');
    persistence.writeTree.mockResolvedValue('mock-tree-oid');
    seekCache = createMockSeekCache();
  });

  it('accepts a seekCache option without consulting it during materialization', async () => {
    setupPersistence(persistence, { w1: 3 });
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      seekCache,
    });

    const result = await graph.materialize({ ceiling: 2 });

    expect(result).toBeDefined();
    expect(graph.seekCache).toBe(seekCache);
    expect(seekCache.get).not.toHaveBeenCalled();
    expect(seekCache.set).not.toHaveBeenCalled();
  });

  it('works without seekCache', async () => {
    setupPersistence(persistence, { w1: 3 });
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: 'test',
      writerId: 'w1',
    });

    const result = await graph.materialize({ ceiling: 2 });

    expect(result).toBeDefined();
    expect(graph.seekCache).toBeNull();
  });

  it('setSeekCache(null) detaches the compatibility surface', async () => {
    setupPersistence(persistence, { w1: 3 });
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      seekCache,
    });

    expect(graph.seekCache).toBe(seekCache);
    graph.setSeekCache((null as any));
    expect(graph.seekCache).toBeNull();

    const result = await graph.materialize({ ceiling: 2 });

    expect(result).toBeDefined();
    expect(seekCache.get).not.toHaveBeenCalled();
    expect(seekCache.set).not.toHaveBeenCalled();
  });
});
