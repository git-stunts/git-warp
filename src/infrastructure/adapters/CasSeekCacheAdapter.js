/**
 * CAS-backed seek materialization cache adapter.
 *
 * Implements SeekCachePort using @git-stunts/git-cas for persistent storage
 * of serialized WarpStateV5 snapshots. Each cached state is stored as a CAS
 * asset (chunked blobs + manifest tree), and an index ref tracks the mapping
 * from cache keys to tree OIDs.
 *
 * Index ref: `refs/warp/<graphName>/seek-cache` → blob containing JSON index.
 *
 * Blobs are loose Git objects — `git gc` prunes them using the configured
 * prune expiry (default ~2 weeks). Use vault pinning for GC-safe persistence.
 *
 * **Requires Node >= 22.0.0** (inherited from `@git-stunts/git-cas`).
 *
 * @module infrastructure/adapters/CasSeekCacheAdapter
 */

import SeekCachePort from '../../ports/SeekCachePort.js';
import { buildSeekCacheRef } from '../../domain/utils/RefLayout.js';
import { Readable } from 'node:stream';

const DEFAULT_MAX_ENTRIES = 200;
const INDEX_SCHEMA_VERSION = 1;
const MAX_CAS_RETRIES = 3;

/**
 * @typedef {Object} IndexEntry
 * @property {string} treeOid - Git tree OID of the CAS asset
 * @property {string} createdAt - ISO 8601 timestamp
 * @property {number} ceiling - Lamport ceiling tick
 * @property {string} frontierHash - Hex hash portion of the cache key
 * @property {number} sizeBytes - Serialized state size in bytes
 * @property {string} codec - Codec identifier (e.g. 'cbor-v1')
 * @property {number} schemaVersion - Index entry schema version
 * @property {string} [lastAccessedAt] - ISO 8601 timestamp of last read (for LRU eviction)
 */

/**
 * @typedef {Object} CacheIndex
 * @property {number} schemaVersion - Index-level schema version
 * @property {Record<string, IndexEntry>} entries - Map of cacheKey → entry
 */

export default class CasSeekCacheAdapter extends SeekCachePort {
  /**
   * @param {{ persistence: *, plumbing: *, graphName: string, maxEntries?: number }} options
   */
  constructor({ persistence, plumbing, graphName, maxEntries }) {
    super();
    this._persistence = persistence;
    this._plumbing = plumbing;
    this._graphName = graphName;
    this._maxEntries = maxEntries ?? DEFAULT_MAX_ENTRIES;
    this._ref = buildSeekCacheRef(graphName);
    this._casPromise = null;
  }

  /**
   * Lazily initializes the ContentAddressableStore.
   * @private
   * @returns {Promise<*>}
   */
  async _getCas() {
    if (!this._casPromise) {
      this._casPromise = this._initCas().catch((err) => {
        this._casPromise = null;
        throw err;
      });
    }
    return await this._casPromise;
  }

  /**
   * @private
   * @returns {Promise<*>}
   */
  async _initCas() {
    const { default: ContentAddressableStore } = await import(
      /* webpackIgnore: true */ '@git-stunts/git-cas'
    );
    return ContentAddressableStore.createCbor({ plumbing: this._plumbing });
  }

  // ---------------------------------------------------------------------------
  // Index management
  // ---------------------------------------------------------------------------

  /**
   * Reads the current cache index from the ref.
   * @private
   * @returns {Promise<CacheIndex>}
   */
  async _readIndex() {
    const oid = await this._persistence.readRef(this._ref);
    if (!oid) {
      return { schemaVersion: INDEX_SCHEMA_VERSION, entries: {} };
    }
    try {
      const buf = await this._persistence.readBlob(oid);
      const parsed = JSON.parse(buf.toString('utf8'));
      if (parsed.schemaVersion !== INDEX_SCHEMA_VERSION) {
        return { schemaVersion: INDEX_SCHEMA_VERSION, entries: {} };
      }
      return parsed;
    } catch {
      return { schemaVersion: INDEX_SCHEMA_VERSION, entries: {} };
    }
  }

  /**
   * Writes the cache index blob and updates the ref.
   * @private
   * @param {CacheIndex} index - The index to write
   * @returns {Promise<void>}
   */
  async _writeIndex(index) {
    const json = JSON.stringify(index);
    const oid = await this._persistence.writeBlob(Buffer.from(json, 'utf8'));
    await this._persistence.updateRef(this._ref, oid);
  }

  /**
   * Mutates the index with retry on write failure.
   *
   * Note: this adapter is single-writer — concurrent index mutations from
   * separate processes may lose updates. The retry loop handles transient
   * I/O errors (e.g. temporary lock contention), not true CAS conflicts.
   *
   * @private
   * @param {function(CacheIndex): CacheIndex} mutate - Mutation function applied to current index
   * @returns {Promise<CacheIndex>} The mutated index
   */
  async _mutateIndex(mutate) {
    /** @type {*} */ // TODO(ts-cleanup): type CAS retry error
    let lastErr;
    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
      const index = await this._readIndex();
      const mutated = mutate(index);
      try {
        await this._writeIndex(mutated);
        return mutated;
      } catch (err) {
        lastErr = err;
        // Transient write failure — retry with fresh read
        if (attempt === MAX_CAS_RETRIES - 1) {
          throw new Error(`CasSeekCacheAdapter: index update failed after retries: ${lastErr.message}`);
        }
      }
    }
    /* c8 ignore next - unreachable */
    throw new Error('CasSeekCacheAdapter: index update failed');
  }

  /**
   * Evicts oldest entries when index exceeds maxEntries.
   * @private
   * @param {CacheIndex} index
   * @returns {CacheIndex}
   */
  _enforceMaxEntries(index) {
    const keys = Object.keys(index.entries);
    if (keys.length <= this._maxEntries) {
      return index;
    }
    // Sort by last access (or creation) ascending — evict least recently used
    const sorted = keys.sort((a, b) => {
      const ea = index.entries[a];
      const eb = index.entries[b];
      const ta = ea.lastAccessedAt || ea.createdAt || '';
      const tb = eb.lastAccessedAt || eb.createdAt || '';
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });
    const toEvict = sorted.slice(0, keys.length - this._maxEntries);
    for (const k of toEvict) {
      delete index.entries[k];
    }
    return index;
  }

  /**
   * Parses ceiling and frontierHash from a versioned cache key.
   * @private
   * @param {string} key - e.g. 'v1:t42-abcdef...'
   * @returns {{ ceiling: number, frontierHash: string }}
   */
  _parseKey(key) {
    const colonIdx = key.indexOf(':');
    const rest = colonIdx >= 0 ? key.slice(colonIdx + 1) : key;
    const dashIdx = rest.indexOf('-');
    const ceiling = parseInt(rest.slice(1, dashIdx), 10);
    const frontierHash = rest.slice(dashIdx + 1);
    return { ceiling, frontierHash };
  }

  // ---------------------------------------------------------------------------
  // SeekCachePort implementation
  // ---------------------------------------------------------------------------

  /**
   * @override
   * @param {string} key
   * @returns {Promise<Buffer|null>}
   */
  async get(key) {
    const cas = await this._getCas();
    const index = await this._readIndex();
    const entry = index.entries[key];
    if (!entry) {
      return null;
    }

    try {
      const manifest = await cas.readManifest({ treeOid: entry.treeOid });
      const { buffer } = await cas.restore({ manifest });
      // Update lastAccessedAt for LRU eviction ordering
      await this._mutateIndex((idx) => {
        if (idx.entries[key]) {
          idx.entries[key].lastAccessedAt = new Date().toISOString();
        }
        return idx;
      });
      return buffer;
    } catch {
      // Blob GC'd or corrupted — self-heal by removing dead entry
      await this._mutateIndex((idx) => {
        delete idx.entries[key];
        return idx;
      });
      return null;
    }
  }

  /**
   * @override
   * @param {string} key
   * @param {Buffer} buffer
   * @returns {Promise<void>}
   */
  async set(key, buffer) {
    const cas = await this._getCas();
    const { ceiling, frontierHash } = this._parseKey(key);

    // Store buffer as CAS asset
    const source = Readable.from([buffer]);
    const manifest = await cas.store({
      source,
      slug: key,
      filename: 'state.cbor',
    });
    const treeOid = await cas.createTree({ manifest });

    // Update index with rich metadata
    await this._mutateIndex((index) => {
      index.entries[key] = {
        treeOid,
        createdAt: new Date().toISOString(),
        ceiling,
        frontierHash,
        sizeBytes: buffer.length,
        codec: 'cbor-v1',
        schemaVersion: INDEX_SCHEMA_VERSION,
      };
      return this._enforceMaxEntries(index);
    });
  }

  /**
   * @override
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async has(key) {
    const index = await this._readIndex();
    return key in index.entries;
  }

  /** @override */
  async keys() {
    const index = await this._readIndex();
    return Object.keys(index.entries);
  }

  /**
   * @override
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async delete(key) {
    let existed = false;
    await this._mutateIndex((index) => {
      existed = key in index.entries;
      delete index.entries[key];
      return index;
    });
    return existed;
  }

  /**
   * Removes the index ref. CAS tree/blob objects are left as loose Git
   * objects and will be pruned by `git gc` (default expiry ~2 weeks).
   * @override
   */
  async clear() {
    try {
      await this._persistence.deleteRef(this._ref);
    } catch {
      // Ref may not exist — that's fine
    }
  }
}
